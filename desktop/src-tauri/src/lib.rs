use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
#[cfg(unix)]
use std::time::Instant;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

struct SidecarHandle(Mutex<Option<Child>>);

// Set just before terminate_gracefully sends SIGTERM/kill, so the sidecar
// exit that causes is never mistaken by the post-boot monitor thread (see
// run() below) for an unexpected crash.
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

fn sidecar_dir(app: &tauri::AppHandle) -> PathBuf {
    // In production the sidecar/ folder is bundled as a resource; in dev the
    // developer runs `cargo tauri dev` from desktop/src-tauri, and the sidecar
    // lives one level up at ../sidecar.
    let resource = app.path().resource_dir();
    if let Ok(resource_dir) = &resource {
        let bundled = resource_dir.join("sidecar");
        if bundled.join("entry.js").exists() {
            return bundled;
        }
    }
    // macOS: tauri's resource_dir() canonicalizes `exe_dir/../Resources`,
    // and realpath(3) fails for .app bundles running under $TMPDIR
    // (/var/folders/…/T/…) — observed on GitHub runners and reproduced on a
    // workstation — even though plain stat on the same paths succeeds.
    // Resolve the bundle layout lexically instead:
    // Contents/MacOS/<exe> → Contents/Resources/sidecar.
    #[cfg(target_os = "macos")]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(contents) = exe.parent().and_then(|d| d.parent()) {
            let bundled = contents.join("Resources").join("sidecar");
            if bundled.join("entry.js").exists() {
                return bundled;
            }
        }
    }
    // The bundled sidecar was not found. In a RELEASE build this must be
    // loud and fatal: the CI installed-app smoke once fell through to the
    // dev fallback below (the compile-time repo path happened to exist on
    // the runner), booted the repo's sidecar with the wrong cwd, and served
    // a bare 404 instead of the SPA — a silent wrong-app instead of a
    // diagnosable crash. Print exactly what was resolved so the failure is
    // debuggable from a job log.
    let exe = std::env::current_exe();
    eprintln!(
        "[shell] bundled sidecar not found: resource_dir={:?} exe={:?} canonicalize(../Resources)={:?}",
        resource,
        exe,
        exe.as_ref()
            .ok()
            .and_then(|e| e.parent())
            .map(|d| std::fs::canonicalize(d.join("../Resources"))),
    );
    if !cfg!(debug_assertions) {
        panic!("bundled sidecar missing from app resources (see resource_dir above)");
    }
    // Dev fallback (debug builds only): <cargo manifest>/../sidecar
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("desktop/src-tauri has a parent")
        .join("sidecar")
}

// Bundle identifiers this app used before the Hoopoe rename, tried in order.
// app_data_dir() is keyed on the identifier, so after the rename an upgraded
// install would otherwise boot into a fresh, empty directory while the user's
// data sat untouched next to it. com.athena.accounting.desktop is what
// v1.0.0-rc.1 … rc.8 shipped, so it wins; com.athena.ledger.desktop only ever
// existed on unreleased builds from main.
const LEGACY_IDENTIFIERS: &[&str] = &["com.athena.accounting.desktop", "com.athena.ledger.desktop"];

// One-shot move of a pre-rename data directory onto `data_dir`. Only runs
// while `data_dir` is missing or empty, so an install that already has data
// under the new identifier is never touched. The move is a same-parent
// rename (atomic, no copy). The sidecar then renames athena.db → hoopoe.db
// inside it (see backend/src/entry/tauri.ts).
fn migrate_legacy_data_dir(data_dir: &Path) -> Result<Option<PathBuf>, (PathBuf, std::io::Error)> {
    let Some(parent) = data_dir.parent() else {
        return Ok(None);
    };
    let is_empty = match std::fs::read_dir(data_dir) {
        Ok(mut entries) => entries.next().is_none(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
    };
    if !is_empty {
        return Ok(None);
    }
    for id in LEGACY_IDENTIFIERS {
        let legacy = parent.join(id);
        if !legacy.is_dir() {
            continue;
        }
        // Windows can't rename onto an existing directory, even an empty one.
        if data_dir.exists() {
            std::fs::remove_dir(data_dir).map_err(|e| (legacy.clone(), e))?;
        }
        std::fs::rename(&legacy, data_dir).map_err(|e| (legacy.clone(), e))?;
        return Ok(Some(legacy));
    }
    Ok(None)
}

fn spawn_sidecar(app: &tauri::AppHandle) -> (Child, u16) {
    let dir = sidecar_dir(app);
    let node_bin = if cfg!(windows) {
        dir.join("node.exe")
    } else {
        dir.join("node")
    };
    let entry = dir.join("entry.js");

    // Point the backend at the platform-standard per-user app-data directory
    // (macOS: ~/Library/Application Support/<bundle-id>/, Linux:
    // ~/.local/share/<bundle-id>/, Windows: %APPDATA%\<bundle-id>\). The
    // sidecar's own cwd is inside the .app resource bundle and is read-only
    // on macOS, so DATA_DIR must be set explicitly.
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("no app data dir available on this platform");
    match migrate_legacy_data_dir(&data_dir) {
        Ok(Some(from)) => eprintln!("[shell] moved legacy data dir {from:?} → {data_dir:?}"),
        Ok(None) => {}
        // Fatal on purpose: carrying on would boot an empty data dir, and the
        // first write into it makes it non-empty, so the migration would never
        // be retried and the user's data would look lost for good.
        Err((from, e)) => panic!(
            "failed to move legacy data dir {from:?} → {data_dir:?}: {e} \
             (quit any running Athena Accounting app and relaunch Hoopoe)"
        ),
    }
    std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&entry)
        .current_dir(&dir)
        .env("DATA_DIR", &data_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    // node.exe is a console-subsystem binary: without CREATE_NO_WINDOW it
    // allocates a visible terminal window behind the app on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().expect("failed to spawn sidecar");

    let stdout = child.stdout.take().expect("sidecar stdout piped");
    enum Startup {
        Port(u16),
        Fatal(String),
    }
    let (tx, rx) = mpsc::channel::<Startup>();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut sent = false;
        for line in reader.lines().map_while(Result::ok) {
            if !sent {
                if let Some(rest) = line.strip_prefix("HOOPOE_PORT=") {
                    if let Ok(port) = rest.trim().parse::<u16>() {
                        let _ = tx.send(Startup::Port(port));
                        sent = true;
                    }
                } else if let Some(msg) = line.strip_prefix("HOOPOE_FATAL=") {
                    let _ = tx.send(Startup::Fatal(msg.to_string()));
                    sent = true;
                }
            }
            println!("[sidecar] {line}");
        }
    });

    let port = match rx.recv_timeout(std::time::Duration::from_secs(30)) {
        Ok(Startup::Port(port)) => port,
        Ok(Startup::Fatal(msg)) => panic!("sidecar failed to start: {msg}"),
        Err(_) => panic!("sidecar did not report HOOPOE_PORT within 30s"),
    };
    (child, port)
}

// How often the post-boot monitor (see run() below) polls the sidecar's
// liveness.
const MONITOR_INTERVAL: Duration = Duration::from_millis(500);

// How long to wait for the sidecar to exit on its own after SIGTERM before
// falling back to a hard kill. Only meaningful on unix, where SIGTERM is
// actually sent (see terminate_gracefully below).
#[cfg(unix)]
const SHUTDOWN_GRACE: Duration = Duration::from_secs(15);
#[cfg(unix)]
const POLL_INTERVAL: Duration = Duration::from_millis(100);

// Ask the sidecar to shut down cleanly before resorting to a hard kill.
// The sidecar's own SIGTERM handler (see backend/src/entry/tauri.ts)
// flushes a final encrypted snapshot and finalizes any pending
// enable/disable migration before exiting — a bare kill() (SIGKILL) skips
// straight past all of that, so a window close during an active
// enable-migration session could leave the on-disk state half-finished.
fn terminate_gracefully(mut child: Child) {
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
    #[cfg(unix)]
    {
        // Avoid pulling in the libc crate just for one syscall — `kill
        // -TERM` via a plain Command does the same thing. Absolute path
        // (not just "kill") so this doesn't depend on PATH in whatever
        // environment the app was launched from. Only a *successful* exit
        // status counts as "sent": `.status()` returning `Ok` just means
        // the `kill` command itself ran, not that it actually delivered the
        // signal (a missing/already-gone pid makes `kill` exit non-zero) —
        // treating any `Ok` as success would burn the whole 15s grace
        // period waiting on a child that was never actually signaled.
        let sent = match Command::new("/bin/kill")
            .arg("-TERM")
            .arg(child.id().to_string())
            .status()
        {
            Ok(status) => status.success(),
            // `.status()` itself returned Err — /bin/kill couldn't even be
            // spawned (missing on some minimal distros/containers), as
            // opposed to running and reporting failure. Retry once via
            // PATH before giving up on a graceful shutdown entirely.
            Err(_) => Command::new("kill")
                .arg("-TERM")
                .arg(child.id().to_string())
                .status()
                .map(|s| s.success())
                .unwrap_or(false),
        };

        if sent {
            let start = Instant::now();
            while start.elapsed() < SHUTDOWN_GRACE {
                match child.try_wait() {
                    // Exited on its own — nothing left to do.
                    Ok(Some(_)) => return,
                    Ok(None) => thread::sleep(POLL_INTERVAL),
                    // Can't determine status; stop waiting and fall through
                    // to the hard kill below.
                    Err(_) => break,
                }
            }
        }
    }
    // Windows has no SIGTERM to send through a plain Command, and the unix
    // path above falls through here if SIGTERM was never delivered or the
    // grace period elapsed without the sidecar exiting.
    let _ = child.kill();
    let _ = child.wait();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let (child, port) = spawn_sidecar(&handle);
            app.manage(SidecarHandle(Mutex::new(Some(child))));

            // spawn_sidecar's reader thread only watches stdout for the
            // *first* HOOPOE_PORT/HOOPOE_FATAL line, then just echoes
            // everything after that with no structured handling. A locked
            // boot can legitimately fail *after* the port was already
            // handed to the WebView (any throw inside tauri.ts's outer
            // try/catch prints a second, now-unwatched HOOPOE_FATAL and
            // exits) — without this, that would just leave a dead, white,
            // unresponsive window with no signal anything went wrong. Poll
            // the sidecar's liveness here instead and crash loudly if it
            // exits on its own: with `panic = "abort"` set in the release
            // profile, a panic on any thread aborts the whole process,
            // which the OS then reports through its normal crash-reporting
            // UI — a working, discoverable failure instead of a silent one.
            let monitor_handle = handle.clone();
            thread::spawn(move || loop {
                thread::sleep(MONITOR_INTERVAL);
                if SHUTTING_DOWN.load(Ordering::SeqCst) {
                    return;
                }
                let Some(state) = monitor_handle.try_state::<SidecarHandle>() else {
                    return;
                };
                let status = {
                    let mut guard = state.0.lock().unwrap();
                    match guard.as_mut() {
                        // Already taken by terminate_gracefully — a
                        // shutdown is under way, stop monitoring.
                        None => return,
                        Some(child) => child.try_wait(),
                    }
                };
                match status {
                    Ok(Some(status)) => {
                        if !SHUTTING_DOWN.load(Ordering::SeqCst) {
                            panic!("sidecar exited unexpectedly: {status}");
                        }
                        return;
                    }
                    // Still running — keep polling.
                    Ok(None) => {}
                    // Can't determine status; stop monitoring rather than
                    // spin on a call that keeps failing.
                    Err(_) => return,
                }
            });

            let url = format!("http://127.0.0.1:{port}/")
                .parse()
                .expect("valid loopback url");
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url))
                .title("Hoopoe")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app, event| match event {
            RunEvent::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            }
            | RunEvent::ExitRequested { .. } => {
                if let Some(state) = app.try_state::<SidecarHandle>() {
                    // Release the mutex *before* terminate_gracefully, which
                    // can block for up to SHUTDOWN_GRACE: binding `.take()`
                    // directly inside an `if let` scrutinee extends that
                    // temporary MutexGuard's lifetime across the entire
                    // `if let` body under edition-2021 temporary-scope
                    // rules, which would hold the lock (and starve the
                    // monitor thread's own `state.0.lock()` above) for the
                    // whole wait. A plain `let` statement drops the guard
                    // at its semicolon, before terminate_gracefully runs.
                    let child = state.0.lock().unwrap().take();
                    if let Some(child) = child {
                        terminate_gracefully(child);
                    }
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("hoopoe-migrate-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn moves_legacy_dir_when_new_one_is_missing() {
        let root = scratch("missing");
        let legacy = root.join("com.athena.accounting.desktop");
        std::fs::create_dir_all(legacy.join("athena.db")).unwrap();
        let data_dir = root.join("com.gekkotron.hoopoe.desktop");

        assert_eq!(
            migrate_legacy_data_dir(&data_dir).unwrap(),
            Some(legacy.clone())
        );
        assert!(data_dir.join("athena.db").is_dir());
        assert!(!legacy.exists());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn replaces_an_empty_new_dir() {
        let root = scratch("empty");
        let legacy = root.join("com.athena.ledger.desktop");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("session-secret.bin"), b"x").unwrap();
        let data_dir = root.join("com.gekkotron.hoopoe.desktop");
        std::fs::create_dir_all(&data_dir).unwrap();

        assert_eq!(migrate_legacy_data_dir(&data_dir).unwrap(), Some(legacy));
        assert!(data_dir.join("session-secret.bin").is_file());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn leaves_a_populated_new_dir_alone() {
        let root = scratch("populated");
        let legacy = root.join("com.athena.accounting.desktop");
        std::fs::create_dir_all(&legacy).unwrap();
        let data_dir = root.join("com.gekkotron.hoopoe.desktop");
        std::fs::create_dir_all(data_dir.join("hoopoe.db")).unwrap();

        assert_eq!(migrate_legacy_data_dir(&data_dir).unwrap(), None);
        assert!(legacy.is_dir());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn prefers_the_released_identifier() {
        let root = scratch("both");
        let released = root.join("com.athena.accounting.desktop");
        let dev = root.join("com.athena.ledger.desktop");
        std::fs::create_dir_all(&released).unwrap();
        std::fs::create_dir_all(&dev).unwrap();
        let data_dir = root.join("com.gekkotron.hoopoe.desktop");

        assert_eq!(migrate_legacy_data_dir(&data_dir).unwrap(), Some(released));
        assert!(dev.is_dir());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn no_op_on_a_fresh_install() {
        let root = scratch("fresh");
        let data_dir = root.join("com.gekkotron.hoopoe.desktop");

        assert_eq!(migrate_legacy_data_dir(&data_dir).unwrap(), None);
        assert!(!data_dir.exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
