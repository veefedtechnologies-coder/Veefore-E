## 2025-02-14 - [Command Injection via exec in FFmpegService]
**Vulnerability:** Use of `child_process.exec` with unescaped string interpolation for variables like `text` and file paths in `ffmpeg-service.ts`, creating a severe command injection vulnerability.
**Learning:** Using `exec` spawns a shell which parses the entire command string, making it trivial for an attacker to break out of quotes and execute arbitrary commands.
**Prevention:** Always use `execFile` or `spawn` instead of `exec`, passing arguments as an array to avoid shell evaluation.
