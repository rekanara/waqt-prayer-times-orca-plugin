# FVM Manager for Orca

Control [FVM](https://fvm.app) (Flutter Version Manager) from Orca's right sidebar.

- Shows the Flutter SDK pinned by the focused workspace (`.fvmrc`), the global SDK and your FVM version.
- Lists installed SDKs: **Use** (`fvm use`), **Global** (`fvm global`), **Remove** (`fvm remove`).
- Lists Flutter releases per channel: **Install** (`fvm install`) or **Use** directly.
- Streams fvm's output into the panel and shows a desktop notification when a job ends.

## Requirements

- Orca 1.4.246 or later
- FVM 3.2 or later on this computer (uses `fvm api` and `--fvm-skip-input`)

## Develop

```sh
orca plugin validate .
orca plugin dev load .          # rerun with the --approve <fingerprint> it prints
orca plugin dev request . fvm.status
orca plugin logs local.fvm-manager
```

Or in Orca: Settings → Plugins → Development folders… → add this folder.

If Orca can't find `fvm`, set **FVM executable** in the plugin's settings to the full path
(`which fvm` on macOS/Linux, `where fvm` on Windows).

## Access

Runs as a trusted worker: it starts `fvm` with your user account. The panel can only ask for
four actions (use, install, remove, global) with a checked version name; it never sends a
command line. Workspaces on SSH or paired hosts are shown but not changed.

## License

MIT
