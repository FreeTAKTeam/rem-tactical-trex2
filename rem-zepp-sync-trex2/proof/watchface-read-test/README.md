# REM Face Read Proof

This is a disposable watch-face proof project for Amazfit T-Rex 2. Install the
REM Sync Mini Program first, tap it until it writes a known status, then install
this proof face.

Expected output:

- `FACE READ OK` means the watch-face runtime can see the Mini Program cache.
- `FACE READ FAIL` means the cache is isolated; keep the production REM face on
  mock/static REM fields and use the Mini Program as the REM status UI.

Observed result:

- The REM Sync Mini Program installed and cycled mock states.
- This proof face displayed `FACE READ FAIL` on the T-Rex 2.
- The tested Mini Program file/session storage is not readable by the watch
  face.

Do not copy this proof into the production REM Tactical face unless `FACE READ OK`
is observed on the physical T-Rex 2.
