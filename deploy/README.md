# Deploy on a NAS with Dockhand

Once set up, updates and tests run from the PC: `deploy/update-nas.ps1` publishes, makes Dockhand
redeploy, waits until the NAS reports the new build, and runs `deploy/smoke_test.py` against it.

## One-time setup (on the NAS)

1. **Archive.** Put the VAULT archive folder (the one holding `01. DRAWERS`, `02. SUSTAINERS`,
   `03. MODIFICATIONS` and the PDF manuals) on a dataset. It is mounted read-only; the app never writes
   to it. 24 GB; copying over SMB is fine.
2. **Dockhand → Git → Repositories → Add Repository**
   - URL `https://github.com/marcelfarres/vault-configurator.git`, auth `none` (public)
   - branch `main`, compose path `deploy/compose.yaml`
3. **Dockhand → Stacks → new Git stack** from that repository
   - environment variable `VAULT_ARCHIVE=<the dataset path from step 1>`. It is a stack variable on
     purpose: the compose file stays generic and your NAS layout stays out of the public repo. The
     stack refuses to start without it.
   - deploy; then open `http://<nas>:8765`. First start measures all 733 STLs once (several minutes;
     cached in the `vault-cache` volume) and extracts the help pages from your PDFs.
4. **Updates.** GitHub cannot reach a NAS on a private network, so the PC asks Dockhand to redeploy.
   Not through the stack webhook: Dockhand's webhook (and its scheduled sync) only redeploys when files in
   the compose folder (`deploy/`) changed, and an app update only changes the image, so it is always
   skipped. The stack's deploy endpoint forces a redeploy, which pulls `:latest`. Put it in
   `working-files/nas.env` (never published):

   ```
   NAS_URL=http://<nas>:8765
   DOCKHAND_DEPLOY=http://<dockhand>/api/git/stacks/<stackId>/deploy
   DOCKHAND_TOKEN=<Dockhand API token, only when Dockhand login is on>
   ```

## Every update (from the PC)

```
vault-configurator\deploy\update-nas.cmd
```

(The `.cmd` runs the `.ps1` for that one process with `-ExecutionPolicy Bypass`: Windows' default
RemoteSigned policy refuses unsigned scripts that live in synced or network folders. The system
policy is not changed.)

1. syncs the tool to GitHub (`publish-github.ps1`) and waits for the image build, 2. asks Dockhand to redeploy the stack, 3. polls
`http://<nas>:8765/api/meta` until its `build` equals the local build id (`version.py`: a hash of the
app's own files), 4. runs the smoke test: archive indexed, a demo stack resolves, every piece placed or
reported, an export writes its 3MF files. `-SkipPublish` re-tests without publishing.

## Notes

- `compose.yaml` runs the prebuilt image `ghcr.io/marcelfarres/vault-configurator:latest`
  (`pull_policy: always`), so nothing is built on the NAS. Stack managers run the compose file from
  their own folder, which is why it must not depend on paths inside the repository.
  `update-nas.ps1` waits for GitHub to finish building the image before it asks Dockhand to redeploy.
- Slicer presets: the container has no slicer, so preset features show nothing unless you mount a
  slicer config folder at `/slicers` and set `APPDATA=/slicers`. Exports then open with the slicer's own
  current presets.
- Exports land in the `vault-output` volume, and the browser downloads each export as a zip (3MFs, BOM.md, stack.json).
- Slicer presets: on the Plates tab, under "Slicer, nozzle and presets", pick your BambuStudio / AnycubicSlicerNext /
  OrcaSlicer settings folder; the server keeps a copy in the `vault-slicers` volume. Pick it again after changing presets.
