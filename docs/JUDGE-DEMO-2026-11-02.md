# One-command local judge experience

From the public source checkout on macOS or a POSIX environment, with Node.js 22.13+ and npm installed (Node.js 24 recommended), run:

```sh
node scripts/judge-demo.mjs
```

If pnpm is already available, `pnpm judge:demo` runs the same command. No DeepSeek key, PayPal account, or real ChatGPT login is needed for this local walkthrough.

The helper has been exercised on macOS. Linux uses the same POSIX process-group path but has not been independently exercised in this validation. Native Windows is rejected before starting a session because process-tree cleanup there has not been validated; use WSL2 or the README's manual local-development instructions. This limitation belongs to the isolated helper, not the hosted app.

The command prepares a new allowlisted source copy under the operating system's temporary directory. It reuses installed dependencies when available; otherwise it uses npm to run the project's fixed pnpm 11.25.0 and installs the pinned lockfile. The first installation requires access to the public npm registry. It then builds, migrates a fresh isolated local D1 database, and starts the app on a free IPv4 loopback port. It only prints a ready entry URL after a unique local marker, disabled provider modes, the existing development sign-in and a read-only D1 request have all been checked.

Open the printed `/signin-with-chatgpt?return_to=/` URL. This uses the application's existing loopback-only fixed development account; it does not log into ChatGPT, ask for a password or prove a second real user's identity. Start the two-sided sample, inspect v1, request changes, switch perspective, submit the revision, inspect the comparison, and explicitly accept it. AI and payments in this session are simulated. Original saved real-model evaluation records are separate evidence, not a fresh model call by this command.

Press Ctrl+C in the terminal to stop this session's owned process groups. The command does not stop an existing app or delete any database. Each invocation creates a fresh session with a fresh database and a different free port. Previous session files remain at their printed location for inspection; repeated use does not resume earlier data. A unique generated readiness marker and matching server PID prevent an unrelated local service from being treated as this app. If a port is claimed during startup, strict port selection fails and the command gives the session log path; rerun to obtain a new session.

The original checkout, its `.env`/`.dev.vars`, hosting audience, runtime provider settings and database are not read into or modified by the demo. Child processes receive a small environment allowlist, empty provider settings, isolated tool configuration/cache paths and empty npm user/global config. The isolated copy has a generated Vite readiness wrapper for this local session only; it is not a deployment configuration. No production access or publication is performed.

Keep this temporary session provider-free. To work on the source or configure your own optional provider keys, stop it and use the original public checkout with the README's separate manual-development instructions. The private session copy is not that manual setup directory and intentionally has no generated `.env.example`; it already has empty demo settings.

For a noninteractive readiness check that builds, migrates, verifies and then stops its owned server:

```sh
node scripts/judge-demo.mjs --smoke
```

This is a local startup/D1 check, not browser usability testing, real-provider proof, a customer trial or a competition submission. If setup fails, inspect the printed `install.log`, `build.log`, migration logs or `server.log`; session files are kept. Never send credentials or private environment files with a bug report.
