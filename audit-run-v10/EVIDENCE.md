# EVIDENCE

Generated: 2026-02-11T18:49:28Z

## Phase 0 Reality Lock
```
/Users/michaelpuchowezki/Dev/rubikvault-site
/Users/michaelpuchowezki/Dev/rubikvault-site
?? RUNBOOK.md
?? audit-evidence/
?? audit-report/
?? audit-run-v10/
?? audit-run-v8/
?? audit-run-v9/
?? run-audit.sh
?? workflow_ids.txt
codex/p0p1-hardening
5e3bb449 fix
github.com
  ✓ Logged in to github.com account RubikVault (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```

## Workflow log capture (+ auto repro on log miss)

### WORKFLOW: v3 Finalizer
```
latest_run_id=21885907570
finalize	UNKNOWN STEP	﻿2026-02-10T23:07:44.4507979Z Current runner version: '2.331.0'
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4532465Z ##[group]Runner Image Provisioner
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4533380Z Hosted Compute Agent
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4534235Z Version: 20260123.484
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4534840Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4535663Z Build Date: 2026-01-23T19:41:17Z
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4536278Z Worker ID: {5df1e3ef-9420-42b5-9778-bb3946b02fde}
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4536952Z Azure Region: northcentralus
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4537523Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4539028Z ##[group]Operating System
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4539656Z Ubuntu
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4540225Z 24.04.3
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4540691Z LTS
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4541137Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4541663Z ##[group]Runner Image
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4542186Z Image: ubuntu-24.04
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4542687Z Version: 20260201.15.1
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4543925Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4545665Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4546593Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4547651Z ##[group]GITHUB_TOKEN Permissions
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4549459Z Actions: read
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4550081Z Contents: write
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4550626Z Metadata: read
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4551070Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4553203Z Secret source: Actions
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4553894Z Prepare workflow directory
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4905894Z Prepare all required actions
finalize	UNKNOWN STEP	2026-02-10T23:07:44.4944352Z Getting action download info
finalize	UNKNOWN STEP	2026-02-10T23:07:44.8498100Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
finalize	UNKNOWN STEP	2026-02-10T23:07:44.9523826Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
finalize	UNKNOWN STEP	2026-02-10T23:07:45.0529580Z Download action repository 'dawidd6/action-download-artifact@v6' (SHA:bf251b5aa9c2f7eeb574a96ee720e24f801b7c11)
finalize	UNKNOWN STEP	2026-02-10T23:07:47.3205828Z Complete job name: finalize
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4093402Z ##[group]Run actions/checkout@v4
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4094955Z with:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4096124Z   token: ***
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4096926Z   repository: RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4097969Z   ssh-strict: true
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4098705Z   ssh-user: git
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4099476Z   persist-credentials: true
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4100346Z   clean: true
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4101097Z   sparse-checkout-cone-mode: true
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4102046Z   fetch-depth: 1
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4102786Z   fetch-tags: false
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4103567Z   show-progress: true
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4104491Z   lfs: false
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4105217Z   submodules: false
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4106016Z   set-safe-directory: true
finalize	UNKNOWN STEP	2026-02-10T23:07:47.4107240Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5405759Z Syncing repository: RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5409133Z ##[group]Getting Git version info
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5411514Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5414501Z [command]/usr/bin/git version
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5493217Z git version 2.52.0
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5520720Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5537327Z Temporarily overriding HOME='/home/runner/work/_temp/0d4a86af-f159-4e70-8511-a0c63fbedd84' before making global git config changes
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5540182Z Adding repository directory to the temporary git global config as a safe directory
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5542947Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5587155Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5590895Z ##[group]Initializing the repository
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5595678Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5725668Z hint: Using 'master' as the name for the initial branch. This default branch name
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5729234Z hint: will change to "main" in Git 3.0. To configure the initial branch name
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5731494Z hint: to use in all of your new repositories, which will suppress this warning,
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5732914Z hint: call:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5733598Z hint:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5734826Z hint: 	git config --global init.defaultBranch <name>
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5736543Z hint:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5737594Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5739362Z hint: 'development'. The just-created branch can be renamed via this command:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5740753Z hint:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5741681Z hint: 	git branch -m <name>
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5742743Z hint:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5743879Z hint: Disable this message with "git config set advice.defaultBranchName false"
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5746178Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5749534Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5782735Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5784283Z ##[group]Disabling automatic garbage collection
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5786655Z [command]/usr/bin/git config --local gc.auto 0
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5818012Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5819306Z ##[group]Setting up auth
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5826705Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
finalize	UNKNOWN STEP	2026-02-10T23:07:47.5862102Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6249944Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6285511Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6522216Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6574872Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6822743Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6861581Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6864172Z ##[group]Fetching the repository
finalize	UNKNOWN STEP	2026-02-10T23:07:47.6873477Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f:refs/remotes/origin/main
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4096497Z From https://github.com/RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4097746Z  * [new ref]         eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f -> origin/main
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4134239Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4134882Z ##[group]Determining the checkout info
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4136413Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4141502Z [command]/usr/bin/git sparse-checkout disable
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4186491Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4214489Z ##[group]Checking out the ref
finalize	UNKNOWN STEP	2026-02-10T23:07:48.4219077Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5364114Z Switched to a new branch 'main'
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5365099Z branch 'main' set up to track 'origin/main'.
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5381063Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5419934Z [command]/usr/bin/git log -1 --format=%H
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5445543Z eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5681842Z ##[group]Run actions/setup-node@v4
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5682210Z with:
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5682440Z   node-version: 20
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5682689Z   always-auth: false
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5682935Z   check-latest: false
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5714482Z   token: ***
finalize	UNKNOWN STEP	2026-02-10T23:07:48.5715284Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:48.7915628Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
finalize	UNKNOWN STEP	2026-02-10T23:07:48.7916476Z ##[group]Environment details
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3081246Z node: v20.20.0
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3081853Z npm: 10.8.2
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3084943Z yarn: 1.22.22
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3086140Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3224618Z ##[group]Run npm ci
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3224946Z [36;1mnpm ci[0m
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3311079Z shell: /usr/bin/bash -e {0}
finalize	UNKNOWN STEP	2026-02-10T23:07:51.3311382Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:54.2468772Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
finalize	UNKNOWN STEP	2026-02-10T23:07:54.2595678Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
finalize	UNKNOWN STEP	2026-02-10T23:07:55.9236906Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1325362Z 
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1326527Z added 106 packages, and audited 107 packages in 8s
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1327219Z 
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1327721Z 18 packages are looking for funding
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1328305Z   run `npm fund` for details
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1969180Z 
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1970047Z 6 vulnerabilities (2 moderate, 4 high)
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1970572Z 
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1971142Z To address all issues (including breaking changes), run:
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1971930Z   npm audit fix --force
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1972268Z 
finalize	UNKNOWN STEP	2026-02-10T23:07:59.1972538Z Run `npm audit` for details.
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2312354Z ##[group]Run dawidd6/action-download-artifact@v6
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2312683Z with:
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2312867Z   workflow: v3-pilot-market.yml
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2313106Z   name: module-market-health
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2313358Z   path: artifacts/module-market-health
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2313631Z   if_no_artifact_found: warn
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2314172Z   github_token: ***
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2314372Z   workflow_search: false
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2314585Z   workflow_conclusion: success
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2314808Z   repo: RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2315074Z   name_is_regexp: false
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2315267Z   allow_forks: false
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2315454Z   check_artifacts: false
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2315651Z   search_artifacts: false
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2315865Z   skip_unpack: false
finalize	UNKNOWN STEP	2026-02-10T23:07:59.2316050Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:07:59.5255066Z ==> Repository: RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:07:59.5256813Z ==> Artifact name: module-market-health
finalize	UNKNOWN STEP	2026-02-10T23:07:59.5257684Z ==> Local path: artifacts/module-market-health
finalize	UNKNOWN STEP	2026-02-10T23:07:59.5258610Z ==> Workflow name: v3-pilot-market.yml
finalize	UNKNOWN STEP	2026-02-10T23:07:59.5259280Z ==> Workflow conclusion: success
finalize	UNKNOWN STEP	2026-02-10T23:07:59.5259830Z ==> Allow forks: false
finalize	UNKNOWN STEP	2026-02-10T23:08:00.4243440Z ==> (found) Run ID: 21146256017
finalize	UNKNOWN STEP	2026-02-10T23:08:00.4244786Z ==> (found) Run date: 2026-01-19T17:20:23Z
finalize	UNKNOWN STEP	2026-02-10T23:08:00.5602137Z ==> Artifact: 5180237406
finalize	UNKNOWN STEP	2026-02-10T23:08:00.5605160Z ==> Downloading: module-market-health.zip (1.67 kB)
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6742830Z ##[warning]no downloadable artifacts found (expired)
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6869920Z ##[group]Run dawidd6/action-download-artifact@v6
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6870221Z with:
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6870463Z   workflow: v3-scrape-template.yml
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6870702Z   name_is_regexp: true
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6870891Z   name: module-.*
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6871069Z   path: artifacts/
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6871248Z   if_no_artifact_found: warn
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6871615Z   github_token: ***
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6871804Z   workflow_search: false
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6872012Z   workflow_conclusion: success
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6872241Z   repo: RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6872463Z   allow_forks: false
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6872652Z   check_artifacts: false
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6873045Z   search_artifacts: false
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6873248Z   skip_unpack: false
finalize	UNKNOWN STEP	2026-02-10T23:08:00.6873426Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:08:00.9824760Z ==> Repository: RubikVault/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:08:00.9825821Z ==> Artifact name: module-.*
finalize	UNKNOWN STEP	2026-02-10T23:08:00.9828045Z ==> Local path: artifacts/
finalize	UNKNOWN STEP	2026-02-10T23:08:00.9828701Z ==> Workflow name: v3-scrape-template.yml
finalize	UNKNOWN STEP	2026-02-10T23:08:00.9829395Z ==> Workflow conclusion: success
finalize	UNKNOWN STEP	2026-02-10T23:08:00.9830017Z ==> Allow forks: false
finalize	UNKNOWN STEP	2026-02-10T23:08:08.2763355Z ==> (found) Run ID: 21228638413
finalize	UNKNOWN STEP	2026-02-10T23:08:08.2763817Z ==> (found) Run date: 2026-01-21T22:54:06Z
finalize	UNKNOWN STEP	2026-02-10T23:08:08.3872206Z ==> Artifact: 5211910009
finalize	UNKNOWN STEP	2026-02-10T23:08:08.3879560Z ==> Downloading: module-market-prices.zip (1.47 kB)
finalize	UNKNOWN STEP	2026-02-10T23:08:08.4977858Z ##[warning]no downloadable artifacts found (expired)
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5136995Z ##[group]Run set +e  # Disable exit on error for this step
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5137470Z [36;1mset +e  # Disable exit on error for this step[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5137784Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5138012Z [36;1m# Reorganize artifacts into expected structure[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5138335Z [36;1mmkdir -p artifacts-organized[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5138581Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5138788Z [36;1mecho "Checking for downloaded artifacts..."[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5139188Z [36;1mif [ ! -d "artifacts" ] || [ -z "$(ls -A artifacts 2>/dev/null)" ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5139642Z [36;1m  echo "⚠ No artifacts directory found or directory is empty"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5140080Z [36;1m  echo "This is expected if the Pilot workflow hasn't run yet"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5140498Z [36;1m  echo "Finalizer will generate empty provider-state.json"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5140918Z [36;1m  exit 0  # Success - this is OK, finalizer handles empty state[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5141279Z [36;1mfi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5141442Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5141627Z [36;1mecho "Artifacts directory contents:"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5141985Z [36;1mls -la artifacts/ 2>/dev/null || echo "No artifacts directory"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5142294Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5142450Z [36;1martifact_count=0[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5142678Z [36;1mfor dir in artifacts/module-*; do[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5142932Z [36;1m  # Check if glob matched anything[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5143184Z [36;1m  if [ ! -e "$dir" ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5143430Z [36;1m    echo "No module-* directories found"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5143685Z [36;1m    break[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5143905Z [36;1m  fi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5144355Z [36;1m  [0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5144520Z [36;1m  if [ -d "$dir" ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5144810Z [36;1m    module_name=$(basename "$dir" | sed 's/module-//')[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5145154Z [36;1m    echo "Processing module: $module_name"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5145469Z [36;1m    mkdir -p "artifacts-organized/$module_name"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5145747Z [36;1m    [0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5145989Z [36;1m    # Find and copy snapshot.json and module-state.json[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5146512Z [36;1m    if find "$dir" -name "snapshot.json" -exec cp {} "artifacts-organized/$module_name/" \; 2>/dev/null; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5146995Z [36;1m      echo "  ✓ Copied snapshot.json"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5147239Z [36;1m    else[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5147466Z [36;1m      echo "  ⚠ snapshot.json not found in $dir"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5147727Z [36;1m    fi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5147890Z [36;1m    [0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5148285Z [36;1m    if find "$dir" -name "module-state.json" -exec cp {} "artifacts-organized/$module_name/" \; 2>/dev/null; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5148782Z [36;1m      echo "  ✓ Copied module-state.json"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5149028Z [36;1m    else[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5149258Z [36;1m      echo "  ⚠ module-state.json not found in $dir"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5149528Z [36;1m    fi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5149680Z [36;1m    [0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5150078Z [36;1m    # Verify both files exist[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5150613Z [36;1m    if [ -f "artifacts-organized/$module_name/snapshot.json" ] && [ -f "artifacts-organized/$module_name/module-state.json" ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5151185Z [36;1m      echo "✓ Organized artifact: $module_name"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5151487Z [36;1m      artifact_count=$((artifact_count + 1))[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5151740Z [36;1m    else[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5152017Z [36;1m      echo "  ⚠ Incomplete artifact for $module_name, removing directory"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5152412Z [36;1m      rm -rf "artifacts-organized/$module_name"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5152679Z [36;1m    fi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5152834Z [36;1m  fi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5152994Z [36;1mdone[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5153146Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5153478Z [36;1mecho ""[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5153790Z [36;1mecho "Artifact organization complete. Found $artifact_count module(s)."[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5154539Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5154779Z [36;1m# Verify structure (only if artifacts were found)[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5155077Z [36;1mif [ $artifact_count -gt 0 ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5155365Z [36;1m  echo "Artifacts organized successfully!"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5155620Z [36;1melse[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5155900Z [36;1m  echo "No artifacts to organize. Finalizer will generate empty state."[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5156232Z [36;1mfi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5156386Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5156745Z [36;1m# Always exit with success - empty artifacts are OK[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5157048Z [36;1mexit 0[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5189211Z shell: /usr/bin/bash -e {0}
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5189458Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5260569Z Checking for downloaded artifacts...
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5279885Z Artifacts directory contents:
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5293459Z total 16
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5294189Z drwxr-xr-x  4 runner runner 4096 Feb 10 23:07 .
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5294899Z drwxr-xr-x 27 runner runner 4096 Feb 10 23:08 ..
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5295629Z drwxr-xr-x  2 runner runner 4096 Feb 10 23:07 ops
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5296492Z drwxr-xr-x  3 runner runner 4096 Feb 10 23:07 truth-audit
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5297745Z No module-* directories found
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5298079Z 
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5298444Z Artifact organization complete. Found 0 module(s).
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5299380Z No artifacts to organize. Finalizer will generate empty state.
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5338043Z ##[group]Run echo "Running finalizer with ARTIFACTS_DIR=$ARTIFACTS_DIR"
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5338555Z [36;1mecho "Running finalizer with ARTIFACTS_DIR=$ARTIFACTS_DIR"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5338904Z [36;1mecho "Current directory: $(pwd)"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5339184Z [36;1mecho "Artifacts directory contents:"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5339574Z [36;1mls -la $ARTIFACTS_DIR/ 2>&1 || echo "Artifacts dir does not exist or is empty"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5339936Z [36;1mecho ""[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5340148Z [36;1mecho "Looking for module directories:"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5340585Z [36;1mfind $ARTIFACTS_DIR -type d -mindepth 1 -maxdepth 1 2>&1 || echo "No directories found"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5340986Z [36;1mecho ""[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5341175Z [36;1mecho "Looking for JSON files:"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5341538Z [36;1mfind $ARTIFACTS_DIR -name "*.json" -type f 2>&1 || echo "No JSON files found"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5341900Z [36;1mecho ""[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5342111Z [36;1mecho "=== RUNNING FINALIZER ==="[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5342388Z [36;1mnode scripts/aggregator/finalize.mjs 2>&1[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5342657Z [36;1mFINALIZER_EXIT=$?[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5342855Z [36;1mecho ""[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5343048Z [36;1mecho "=== FINALIZER COMPLETED ==="[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5343311Z [36;1mecho "Exit code: $FINALIZER_EXIT"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5343536Z [36;1m[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5343714Z [36;1mif [ $FINALIZER_EXIT -ne 0 ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5344163Z [36;1m  echo ""[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5344700Z [36;1m  echo "❌ ERROR: Finalizer failed with exit code $FINALIZER_EXIT"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5345141Z [36;1m  echo "Check the logs above for detailed error information"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5345473Z [36;1m  exit $FINALIZER_EXIT[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5345685Z [36;1melse[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5345903Z [36;1m  echo "✅ Finalizer completed successfully"[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5346169Z [36;1mfi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5377603Z shell: /usr/bin/bash -e {0}
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5377831Z env:
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5378016Z   ARTIFACTS_DIR: artifacts-organized
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5378250Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5431283Z Running finalizer with ARTIFACTS_DIR=artifacts-organized
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5436104Z Current directory: /home/runner/work/rubikvault-site/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5436739Z Artifacts directory contents:
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5449893Z total 8
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5450357Z drwxr-xr-x  2 runner runner 4096 Feb 10 23:08 .
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5450928Z drwxr-xr-x 27 runner runner 4096 Feb 10 23:08 ..
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5451895Z 
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5452153Z Looking for module directories:
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5467035Z 
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5467380Z Looking for JSON files:
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5481083Z 
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5481341Z === RUNNING FINALIZER ===
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5842521Z 🔍 Debug: Detected as main module
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5847004Z   import.meta.url: file:///home/runner/work/rubikvault-site/rubikvault-site/scripts/aggregator/finalize.mjs
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5848379Z   process.argv[1]: /home/runner/work/rubikvault-site/rubikvault-site/scripts/aggregator/finalize.mjs
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5849168Z 🔍 Debug: Calling main()...
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5851670Z 🚀 Finalizer starting...
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5852169Z   Node version: v20.20.0
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5852845Z   CWD: /home/runner/work/rubikvault-site/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5853540Z   ARTIFACTS_DIR: artifacts-organized
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5854484Z   BASE_DIR: /home/runner/work/rubikvault-site/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5855620Z   TMP_DIR: /home/runner/work/rubikvault-site/rubikvault-site/public/data/.tmp
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5856840Z   PUBLIC_DIR: /home/runner/work/rubikvault-site/rubikvault-site/public/data
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5857890Z   REGISTRY_PATH: /home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5858541Z 
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5858815Z 📋 Step 1: Loading registry...
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5859953Z   Looking for registry at: /home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5865809Z ERROR: Failed to load registry: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json'
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5918242Z ##[error]Process completed with exit code 1.
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5983774Z ##[group]Run echo "## Finalizer v3.0" >> $GITHUB_STEP_SUMMARY
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5984476Z [36;1mecho "## Finalizer v3.0" >> $GITHUB_STEP_SUMMARY[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5984797Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5985094Z [36;1mecho "- Status: failure" >> $GITHUB_STEP_SUMMARY[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5985417Z [36;1mecho "- Changes: " >> $GITHUB_STEP_SUMMARY[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5985728Z [36;1mif [ -f public/data/manifest.json ]; then[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5986047Z [36;1m  echo "- Manifest: ✓" >> $GITHUB_STEP_SUMMARY[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.5986312Z [36;1mfi[0m
finalize	UNKNOWN STEP	2026-02-10T23:08:08.6017862Z shell: /usr/bin/bash -e {0}
finalize	UNKNOWN STEP	2026-02-10T23:08:08.6018097Z ##[endgroup]
finalize	UNKNOWN STEP	2026-02-10T23:08:08.6143703Z Post job cleanup.
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7114590Z [command]/usr/bin/git version
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7164469Z git version 2.52.0
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7226857Z Temporarily overriding HOME='/home/runner/work/_temp/f607d7b9-23aa-41aa-a2e0-69bc9dbf3794' before making global git config changes
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7228078Z Adding repository directory to the temporary git global config as a safe directory
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7241382Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7283665Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7320130Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7563784Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7586746Z http.https://github.com/.extraheader
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7600288Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7632401Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7866106Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
finalize	UNKNOWN STEP	2026-02-10T23:08:08.7898941Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
finalize	UNKNOWN STEP	2026-02-10T23:08:08.8250626Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: v3 Scrape Template
```
latest_run_id=21885900868
prepare	UNKNOWN STEP	﻿2026-02-10T23:07:28.5528155Z Current runner version: '2.331.0'
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5552087Z ##[group]Runner Image Provisioner
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5552774Z Hosted Compute Agent
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5553338Z Version: 20260123.484
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5553912Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5554605Z Build Date: 2026-01-23T19:41:17Z
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5555234Z Worker ID: {e3fd5541-4406-465f-9947-774f8ce9e20c}
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5555848Z Azure Region: northcentralus
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5556349Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5557687Z ##[group]Operating System
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5558198Z Ubuntu
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5558572Z 24.04.3
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5559032Z LTS
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5559425Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5559861Z ##[group]Runner Image
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5560366Z Image: ubuntu-24.04
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5560789Z Version: 20260201.15.1
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5561858Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5563083Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5563879Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5566391Z ##[group]GITHUB_TOKEN Permissions
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5569106Z Actions: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5569691Z ArtifactMetadata: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5570207Z Attestations: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5570610Z Checks: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5571133Z Contents: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5571568Z Deployments: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5572027Z Discussions: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5572485Z Issues: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5572942Z Metadata: read
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5573346Z Models: read
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5573939Z Packages: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5574494Z Pages: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5575027Z PullRequests: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5575544Z RepositoryProjects: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5576018Z SecurityEvents: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5576483Z Statuses: write
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5576914Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5578989Z Secret source: Actions
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5579611Z Prepare workflow directory
prepare	UNKNOWN STEP	2026-02-10T23:07:28.5951962Z Prepare all required actions
prepare	UNKNOWN STEP	2026-02-10T23:07:28.6010200Z Getting action download info
prepare	UNKNOWN STEP	2026-02-10T23:07:28.9072937Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
prepare	UNKNOWN STEP	2026-02-10T23:07:29.3329861Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
prepare	UNKNOWN STEP	2026-02-10T23:07:29.5566037Z Complete job name: prepare
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6152300Z ##[group]Run set -euo pipefail
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6153220Z [36;1mset -euo pipefail[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6153828Z [36;1mecho "=== DEBUG: artifacts root ==="[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6154655Z [36;1mls -lah "$ARTIFACTS_DIR" || true[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6155312Z [36;1mecho ""[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6156021Z [36;1mecho "=== DEBUG: find snapshot.json/module-state.json ==="[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6157306Z [36;1mfind "$ARTIFACTS_DIR" -maxdepth 4 -type f \( -name "snapshot.json" -o -name "module-state.json" \) -print -exec wc -c {} \; || true[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6158507Z [36;1mecho ""[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6159227Z [36;1mecho "=== DEBUG: print market-prices snapshot.json (first 120 lines) ==="[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6160186Z [36;1mif [ -f "$ARTIFACTS_DIR/market-prices/snapshot.json" ]; then[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6161115Z [36;1m  sed -n '1,120p' "$ARTIFACTS_DIR/market-prices/snapshot.json"[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6161843Z [36;1m  echo ""[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6162523Z [36;1m  echo "=== DEBUG: jq key fields ==="[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6163159Z [36;1m  jq -r '{[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6163757Z [36;1m    schema_version: (.schema_version // null),[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6164655Z [36;1m    meta_source: (.meta.source // null),[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6165429Z [36;1m    metadata_source: (.metadata.source // null),[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6166237Z [36;1m    metadata_provider: (.metadata.provider // null),[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6167004Z [36;1m    record_count: (.metadata.record_count // null),[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6168132Z [36;1m    data_len: (if ((.data|type)=="array") then (.data|length) else 0 end),[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6168950Z [36;1m    error: (.error // null)[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6169594Z [36;1m  }' "$ARTIFACTS_DIR/market-prices/snapshot.json"[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6170333Z [36;1melse[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6170956Z [36;1m  echo "MISSING: $ARTIFACTS_DIR/market-prices/snapshot.json"[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6171685Z [36;1mfi[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6197532Z shell: /usr/bin/bash -e {0}
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6198386Z env:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6199084Z   ARTIFACTS_DIR: /home/runner/work/_temp/artifacts
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6199810Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6316794Z === DEBUG: artifacts root ===
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6318511Z ls: cannot access '/home/runner/work/_temp/artifacts': No such file or directory
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6320343Z 
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6321001Z === DEBUG: find snapshot.json/module-state.json ===
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6329512Z find: ‘/home/runner/work/_temp/artifacts’: No such file or directory
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6330746Z 
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6331525Z === DEBUG: print market-prices snapshot.json (first 120 lines) ===
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6333474Z MISSING: /home/runner/work/_temp/artifacts/market-prices/snapshot.json
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6535546Z ##[group]Run actions/checkout@v4
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6536215Z with:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6536819Z   repository: RubikVault/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6537639Z   token: ***
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6538114Z   ssh-strict: true
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6538657Z   ssh-user: git
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6539176Z   persist-credentials: true
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6539711Z   clean: true
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6540253Z   sparse-checkout-cone-mode: true
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6540849Z   fetch-depth: 1
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6541315Z   fetch-tags: false
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6541858Z   show-progress: true
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6542342Z   lfs: false
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6542829Z   submodules: false
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6543394Z   set-safe-directory: true
prepare	UNKNOWN STEP	2026-02-10T23:07:29.6543955Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:29.7557307Z Syncing repository: RubikVault/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:29.7559466Z ##[group]Getting Git version info
prepare	UNKNOWN STEP	2026-02-10T23:07:29.7560501Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
prepare	UNKNOWN STEP	2026-02-10T23:07:29.7561748Z [command]/usr/bin/git version
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9054681Z git version 2.52.0
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9079993Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9096347Z Temporarily overriding HOME='/home/runner/work/_temp/35f98ca2-6b27-4e6d-b054-4336f5817045' before making global git config changes
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9103115Z Adding repository directory to the temporary git global config as a safe directory
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9105805Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9195898Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9198630Z ##[group]Initializing the repository
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9204092Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9876107Z hint: Using 'master' as the name for the initial branch. This default branch name
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9877249Z hint: will change to "main" in Git 3.0. To configure the initial branch name
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9878191Z hint: to use in all of your new repositories, which will suppress this warning,
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9878913Z hint: call:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9879295Z hint:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9879807Z hint: 	git config --global init.defaultBranch <name>
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9880398Z hint:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9880956Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9881871Z hint: 'development'. The just-created branch can be renamed via this command:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9882577Z hint:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9882970Z hint: 	git branch -m <name>
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9883440Z hint:
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9884038Z hint: Disable this message with "git config set advice.defaultBranchName false"
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9929521Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
prepare	UNKNOWN STEP	2026-02-10T23:07:29.9942206Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0046678Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0048058Z ##[group]Disabling automatic garbage collection
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0052114Z [command]/usr/bin/git config --local gc.auto 0
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0078309Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0079526Z ##[group]Setting up auth
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0086141Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
prepare	UNKNOWN STEP	2026-02-10T23:07:30.0113045Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2470056Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2496623Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2672588Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2699649Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2878118Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2908917Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2911211Z ##[group]Fetching the repository
prepare	UNKNOWN STEP	2026-02-10T23:07:30.2921074Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f:refs/remotes/origin/main
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0561699Z From https://github.com/RubikVault/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0565276Z  * [new ref]         eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f -> origin/main
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0658717Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0661087Z ##[group]Determining the checkout info
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0663674Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0665664Z [command]/usr/bin/git sparse-checkout disable
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0792179Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0817201Z ##[group]Checking out the ref
prepare	UNKNOWN STEP	2026-02-10T23:07:31.0821501Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
prepare	UNKNOWN STEP	2026-02-10T23:07:31.1776302Z Switched to a new branch 'main'
prepare	UNKNOWN STEP	2026-02-10T23:07:31.1779261Z branch 'main' set up to track 'origin/main'.
prepare	UNKNOWN STEP	2026-02-10T23:07:31.1788226Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:31.1822609Z [command]/usr/bin/git log -1 --format=%H
prepare	UNKNOWN STEP	2026-02-10T23:07:31.1841961Z eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2081653Z ##[group]Run actions/setup-node@v4
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2082626Z with:
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2083289Z   node-version: 20
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2084030Z   always-auth: false
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2084905Z   check-latest: false
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2085957Z   token: ***
prepare	UNKNOWN STEP	2026-02-10T23:07:31.2086646Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:31.4180525Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
prepare	UNKNOWN STEP	2026-02-10T23:07:31.4188479Z ##[group]Environment details
prepare	UNKNOWN STEP	2026-02-10T23:07:34.1938023Z node: v20.20.0
prepare	UNKNOWN STEP	2026-02-10T23:07:34.1938576Z npm: 10.8.2
prepare	UNKNOWN STEP	2026-02-10T23:07:34.1938845Z yarn: 1.22.22
prepare	UNKNOWN STEP	2026-02-10T23:07:34.1939695Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2004063Z ##[group]Run # Read enabled modules from registry
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2004697Z [36;1m# Read enabled modules from registry[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2004969Z [36;1mMODULES=$(node -e "[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2005297Z [36;1m  const registry = require('./public/data/registry/modules.json');[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2005710Z [36;1m  const modules = Object.entries(registry.modules || registry)[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2006179Z [36;1m    .filter(([name, config]) => {[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2006456Z [36;1m      // Skip schema_version and metadata fields[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2006986Z [36;1m      if (name === 'schema_version' || name === 'generated_at' || name === 'modules' || name === 'tiers' || name === 'policies') return false;[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2007490Z [36;1m      // Only include enabled modules[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2007755Z [36;1m      return config.enabled !== false;[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2008027Z [36;1m    })[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2008261Z [36;1m    .map(([name]) => name);[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2008516Z [36;1m  console.log(JSON.stringify(modules));[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2008772Z [36;1m")[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2008929Z [36;1m[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2009129Z [36;1mecho "Available modules: $MODULES"[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2009360Z [36;1m[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2009562Z [36;1m# If manual trigger with specific modules[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2009830Z [36;1mINPUT_MODULES=''[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2010137Z [36;1mif [ ! -z "$INPUT_MODULES" ] && [ "$INPUT_MODULES" != "all" ]; then[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2010474Z [36;1m  # Parse comma-separated list[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2010831Z [36;1m  MODULES=$(echo "$INPUT_MODULES" | jq -R 'split(",") | map(gsub("^\\s+|\\s+$";""))')[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2011187Z [36;1mfi[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2011340Z [36;1m[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2011572Z [36;1mecho "matrix={\"module\":$MODULES}" >> $GITHUB_OUTPUT[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2011897Z [36;1mecho "Scraping modules: $MODULES"[0m
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2100087Z shell: /usr/bin/bash -e {0}
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2100357Z ##[endgroup]
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2373165Z node:internal/modules/cjs/loader:1210
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2373628Z   throw err;
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2373831Z   ^
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2373965Z 
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2374274Z Error: Cannot find module './public/data/registry/modules.json'
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2375036Z Require stack:
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2375401Z - /home/runner/work/rubikvault-site/rubikvault-site/[eval]
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2375985Z     at Module._resolveFilename (node:internal/modules/cjs/loader:1207:15)
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2376492Z     at Module._load (node:internal/modules/cjs/loader:1038:27)
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2376954Z     at Module.require (node:internal/modules/cjs/loader:1289:19)
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2377342Z     at require (node:internal/modules/helpers:182:18)
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2377613Z     at [eval]:2:20
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2377895Z     at runScriptInThisContext (node:internal/vm:209:10)
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2378283Z     at node:internal/process/execution:118:14
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2378619Z     at [eval]-wrapper:6:24
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2378922Z     at runScript (node:internal/process/execution:101:62)
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2379297Z     at evalScript (node:internal/process/execution:133:3) {
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2379594Z   code: 'MODULE_NOT_FOUND',
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2379979Z   requireStack: [ '/home/runner/work/rubikvault-site/rubikvault-site/[eval]' ]
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2380336Z }
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2380431Z 
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2380514Z Node.js v20.20.0
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2394115Z ##[error]Process completed with exit code 1.
prepare	UNKNOWN STEP	2026-02-10T23:07:34.2493862Z Post job cleanup.
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3376414Z [command]/usr/bin/git version
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3408715Z git version 2.52.0
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3446752Z Temporarily overriding HOME='/home/runner/work/_temp/aa6142bb-0cae-429e-8302-00af838e488d' before making global git config changes
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3447572Z Adding repository directory to the temporary git global config as a safe directory
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3451717Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3483482Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3511049Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3793974Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3812856Z http.https://github.com/.extraheader
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3823546Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
prepare	UNKNOWN STEP	2026-02-10T23:07:34.3848885Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
prepare	UNKNOWN STEP	2026-02-10T23:07:34.4026263Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
prepare	UNKNOWN STEP	2026-02-10T23:07:34.4052550Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
prepare	UNKNOWN STEP	2026-02-10T23:07:34.4315844Z Evaluate and set job outputs
prepare	UNKNOWN STEP	2026-02-10T23:07:34.4322361Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: CI Gates - Quality & Budget Checks
```
latest_run_id=21829656562
Repository Policy Checks	UNKNOWN STEP	﻿2026-02-09T14:47:02.3018549Z Current runner version: '2.331.0'
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3043081Z ##[group]Runner Image Provisioner
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3043821Z Hosted Compute Agent
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3045232Z Version: 20260123.484
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3046195Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3047540Z Build Date: 2026-01-23T19:41:17Z
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3048690Z Worker ID: {c19b70bb-1d1d-470d-b3b3-0046c8df42cd}
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3049404Z Azure Region: eastus
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3049942Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3051507Z ##[group]Operating System
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3052134Z Ubuntu
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3052578Z 24.04.3
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3053239Z LTS
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3053846Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3054746Z ##[group]Runner Image
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3055876Z Image: ubuntu-24.04
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3056760Z Version: 20260201.15.1
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3058737Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3060451Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3061366Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3064110Z ##[group]GITHUB_TOKEN Permissions
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3066548Z Actions: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3067606Z ArtifactMetadata: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3068495Z Attestations: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3069441Z Checks: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3071039Z Contents: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3072018Z Deployments: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3072986Z Discussions: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3073817Z Issues: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3074847Z Metadata: read
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3075716Z Models: read
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3076610Z Packages: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3077841Z Pages: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3078810Z PullRequests: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3079705Z RepositoryProjects: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3080668Z SecurityEvents: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3081665Z Statuses: write
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3082569Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3085224Z Secret source: Actions
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3086420Z Prepare workflow directory
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3422335Z Prepare all required actions
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.3460864Z Getting action download info
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.6668285Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.8399072Z Complete job name: Repository Policy Checks
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9197688Z ##[group]Run actions/checkout@v4
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9198581Z with:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9199026Z   repository: RubikVault/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9199782Z   token: ***
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9200174Z   ssh-strict: true
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9200580Z   ssh-user: git
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9200988Z   persist-credentials: true
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9201460Z   clean: true
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9201865Z   sparse-checkout-cone-mode: true
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9202347Z   fetch-depth: 1
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9202744Z   fetch-tags: false
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9203160Z   show-progress: true
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9203625Z   lfs: false
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9204000Z   submodules: false
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9204427Z   set-safe-directory: true
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:02.9205118Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0284807Z Syncing repository: RubikVault/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0286599Z ##[group]Getting Git version info
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0287842Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0288968Z [command]/usr/bin/git version
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0349115Z git version 2.52.0
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0378354Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0393580Z Temporarily overriding HOME='/home/runner/work/_temp/969e24e8-bf4f-49c3-9653-83cdc10718ca' before making global git config changes
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0394947Z Adding repository directory to the temporary git global config as a safe directory
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0408046Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0448476Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0452041Z ##[group]Initializing the repository
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0456186Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0546776Z hint: Using 'master' as the name for the initial branch. This default branch name
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0548184Z hint: will change to "main" in Git 3.0. To configure the initial branch name
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0549105Z hint: to use in all of your new repositories, which will suppress this warning,
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0549840Z hint: call:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0550245Z hint:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0550941Z hint: 	git config --global init.defaultBranch <name>
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0551758Z hint:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0552310Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0553181Z hint: 'development'. The just-created branch can be renamed via this command:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0553870Z hint:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0554273Z hint: 	git branch -m <name>
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0554761Z hint:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0555348Z hint: Disable this message with "git config set advice.defaultBranchName false"
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0556699Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0562564Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0597119Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0598017Z ##[group]Disabling automatic garbage collection
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0601451Z [command]/usr/bin/git config --local gc.auto 0
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0630302Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0630996Z ##[group]Setting up auth
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0637246Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0669039Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.0988414Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1021425Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1251476Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1284513Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1511428Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1546040Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1546863Z ##[group]Fetching the repository
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.1554561Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6797554Z From https://github.com/RubikVault/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6800457Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6831796Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6833082Z ##[group]Determining the checkout info
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6834779Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6840501Z [command]/usr/bin/git sparse-checkout disable
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6883597Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6911916Z ##[group]Checking out the ref
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.6916571Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8044716Z Switched to a new branch 'main'
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8045821Z branch 'main' set up to track 'origin/main'.
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8062140Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8101704Z [command]/usr/bin/git log -1 --format=%H
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8124403Z 166a15246fc75b11da12b0f8504ef8fb77a01229
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8342069Z ##[group]Run echo "🔍 Checking Repository Policies..."
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8343397Z [36;1mecho "🔍 Checking Repository Policies..."[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8344316Z [36;1m[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8344766Z [36;1mVIOLATIONS=0[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8345311Z [36;1m[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8346032Z [36;1m# Check: No blanket ignores for public/data or mirrors[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8347526Z [36;1mif grep -nE '^(public/data/|mirrors/)$' .gitignore; then[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8349281Z [36;1m  echo "❌ VIOLATION: .gitignore contains blanket ignore for public/data/ or mirrors/"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8350812Z [36;1m  VIOLATIONS=$((VIOLATIONS + 1))[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8351570Z [36;1melse[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8352183Z [36;1m  echo "✅ .gitignore blanket ignore guard OK"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8353059Z [36;1mfi[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8353476Z [36;1m[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8353998Z [36;1m# Check: No build/ directory committed[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8354911Z [36;1mif [ -d "build" ]; then[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8355754Z [36;1m  BUILD_FILES=$(find build -type f | wc -l)[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8356728Z [36;1m  if [ $BUILD_FILES -gt 0 ]; then[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8357989Z [36;1m    echo "❌ VIOLATION: build/ directory contains $BUILD_FILES files"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8359475Z [36;1m    echo "build/ must not be committed (add to .gitignore)"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8360608Z [36;1m    VIOLATIONS=$((VIOLATIONS + 1))[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8361398Z [36;1m  fi[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8361883Z [36;1mfi[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8362343Z [36;1m[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8362974Z [36;1m# Check: No modules write to provider-state.json[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8365126Z [36;1mPROVIDER_STATE_WRITES=$(grep -r "provider-state.json" scripts/providers/ 2>/dev/null | grep -v "read" | grep -v "#" || true)[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8367238Z [36;1mif [ ! -z "$PROVIDER_STATE_WRITES" ]; then[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8368672Z [36;1m  echo "❌ VIOLATION: Provider scripts writing to provider-state.json"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8370023Z [36;1m  echo "$PROVIDER_STATE_WRITES"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8370895Z [36;1m  VIOLATIONS=$((VIOLATIONS + 1))[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8371674Z [36;1mfi[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8372136Z [36;1m[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8372622Z [36;1m# Check: No KV writes in functions[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8373926Z [36;1mKV_WRITES=$(grep -r "KV.put\|kv.put" functions/ 2>/dev/null | grep -v "#" || true)[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8375301Z [36;1mif [ ! -z "$KV_WRITES" ]; then[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8376681Z [36;1m  echo "❌ VIOLATION: KV writes forbidden in functions (functions must be read-only)"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8378271Z [36;1m  echo "$KV_WRITES"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8378982Z [36;1m  VIOLATIONS=$((VIOLATIONS + 1))[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8379761Z [36;1mfi[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8380205Z [36;1m[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8380658Z [36;1mecho ""[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8381287Z [36;1mecho "═══════════════════════════════════════"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8382241Z [36;1mecho "       REPOSITORY POLICIES"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8383161Z [36;1mecho "═══════════════════════════════════════"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8384083Z [36;1mecho "Violations: $VIOLATIONS"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8384919Z [36;1mif [ $VIOLATIONS -gt 0 ]; then[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8385711Z [36;1m  echo "Status:     ❌ FAIL"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8386443Z [36;1m  exit 1[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8386950Z [36;1melse[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8387663Z [36;1m  echo "Status:     ✅ PASS"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8388396Z [36;1mfi[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8388995Z [36;1mecho "═══════════════════════════════════════"[0m
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8425166Z shell: /usr/bin/bash -e {0}
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8425830Z ##[endgroup]
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8504332Z 🔍 Checking Repository Policies...
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8518942Z ✅ .gitignore blanket ignore guard OK
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8576151Z 
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8577000Z ═══════════════════════════════════════
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8578735Z        REPOSITORY POLICIES
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8580028Z ═══════════════════════════════════════
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8581188Z Violations: 0
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8581787Z Status:     ✅ PASS
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8582454Z ═══════════════════════════════════════
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.8753143Z Post job cleanup.
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9717957Z [command]/usr/bin/git version
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9755841Z git version 2.52.0
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9801677Z Temporarily overriding HOME='/home/runner/work/_temp/620eb659-f7da-4d16-9988-f02cd13eb16d' before making global git config changes
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9804216Z Adding repository directory to the temporary git global config as a safe directory
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9806866Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9850183Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:03.9883463Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0140982Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0162786Z http.https://github.com/.extraheader
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0177563Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0212091Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0445780Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0479633Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Repository Policy Checks	UNKNOWN STEP	2026-02-09T14:47:04.0838002Z Cleaning up orphan processes
Asset Budget Check	UNKNOWN STEP	﻿2026-02-09T14:47:02.9137477Z Current runner version: '2.331.0'
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9162658Z ##[group]Runner Image Provisioner
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9163535Z Hosted Compute Agent
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9164075Z Version: 20260123.484
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9164656Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9165285Z Build Date: 2026-01-23T19:41:17Z
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9166017Z Worker ID: {f6885874-07d9-4884-9bf3-3c21d25e61be}
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9166676Z Azure Region: westus
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9167182Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9168577Z ##[group]Operating System
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9169480Z Ubuntu
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9169907Z 24.04.3
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9170434Z LTS
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9170917Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9171372Z ##[group]Runner Image
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9171953Z Image: ubuntu-24.04
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9172420Z Version: 20260201.15.1
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9173610Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9175098Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9175957Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9178920Z ##[group]GITHUB_TOKEN Permissions
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9181041Z Actions: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9181643Z ArtifactMetadata: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9182240Z Attestations: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9182700Z Checks: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9183573Z Contents: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9184074Z Deployments: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9184629Z Discussions: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9185133Z Issues: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9185674Z Metadata: read
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9186184Z Models: read
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9186606Z Packages: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9187169Z Pages: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9187716Z PullRequests: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9188232Z RepositoryProjects: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9189131Z SecurityEvents: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9189684Z Statuses: write
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9190203Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9192236Z Secret source: Actions
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9192997Z Prepare workflow directory
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9510479Z Prepare all required actions
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:02.9546972Z Getting action download info
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.4254527Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.6265884Z Complete job name: Asset Budget Check
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7036887Z ##[group]Run actions/checkout@v4
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7037694Z with:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7038104Z   repository: RubikVault/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7039087Z   token: ***
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7039480Z   ssh-strict: true
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7039861Z   ssh-user: git
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7040241Z   persist-credentials: true
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7040664Z   clean: true
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7041042Z   sparse-checkout-cone-mode: true
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7041505Z   fetch-depth: 1
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7041875Z   fetch-tags: false
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7042262Z   show-progress: true
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7042668Z   lfs: false
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7043032Z   submodules: false
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7043426Z   set-safe-directory: true
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.7044127Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8111889Z Syncing repository: RubikVault/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8113789Z ##[group]Getting Git version info
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8114608Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8115648Z [command]/usr/bin/git version
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8198886Z git version 2.52.0
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8224923Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8240893Z Temporarily overriding HOME='/home/runner/work/_temp/2c42e826-86b2-467a-9a23-be56f29c6cf4' before making global git config changes
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8243261Z Adding repository directory to the temporary git global config as a safe directory
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8255037Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8294071Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8298012Z ##[group]Initializing the repository
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8302955Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8417898Z hint: Using 'master' as the name for the initial branch. This default branch name
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8419622Z hint: will change to "main" in Git 3.0. To configure the initial branch name
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8420575Z hint: to use in all of your new repositories, which will suppress this warning,
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8421493Z hint: call:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8422162Z hint:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8422816Z hint: 	git config --global init.defaultBranch <name>
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8423466Z hint:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8424483Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8426224Z hint: 'development'. The just-created branch can be renamed via this command:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8427585Z hint:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8428292Z hint: 	git branch -m <name>
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8429320Z hint:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8430351Z hint: Disable this message with "git config set advice.defaultBranchName false"
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8432148Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8435920Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8468829Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8470061Z ##[group]Disabling automatic garbage collection
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8473644Z [command]/usr/bin/git config --local gc.auto 0
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8501801Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8503001Z ##[group]Setting up auth
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8509229Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8539348Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8906570Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.8938285Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.9156078Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.9184709Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.9407470Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.9440241Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.9441003Z ##[group]Fetching the repository
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:03.9448157Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2177710Z From https://github.com/RubikVault/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2179262Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2213714Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2215013Z ##[group]Determining the checkout info
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2216811Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2220930Z [command]/usr/bin/git sparse-checkout disable
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2264882Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2293795Z ##[group]Checking out the ref
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.2300060Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3430106Z Switched to a new branch 'main'
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3431672Z branch 'main' set up to track 'origin/main'.
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3447498Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3484336Z [command]/usr/bin/git log -1 --format=%H
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3507089Z 166a15246fc75b11da12b0f8504ef8fb77a01229
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3728319Z ##[group]Run echo "🔍 Checking Asset Budget..."
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3730231Z [36;1mecho "🔍 Checking Asset Budget..."[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3731622Z [36;1mmkdir -p public/data[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3733496Z [36;1mif ! find public/data -type f -name "*.json" -print -quit | grep -q .; then[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3735571Z [36;1m  SENTINEL_PATH="public/data/.budget_sentinel.json"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3737232Z [36;1m  SENTINEL_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3738863Z [36;1m  cat > "$SENTINEL_PATH" <<EOF[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3740914Z [36;1m{"meta":{"type":"asset_budget_sentinel","sha":"${GITHUB_SHA:-local}","created_at":"${SENTINEL_TS}"}}[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3742960Z [36;1mEOF[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3744840Z [36;1m  echo "ℹ️ Created budget sentinel at $SENTINEL_PATH (no tracked public/data json artifacts in checkout)"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3747032Z [36;1mfi[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3747931Z [36;1m[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3749177Z [36;1m# Count files in public/data[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3750932Z [36;1mTOTAL_FILES=$(find public/data -type f -name "*.json" | wc -l | tr -d ' ')[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3752802Z [36;1mecho "Total JSON files: $TOTAL_FILES"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3754059Z [36;1m[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3755549Z [36;1m# Check total file count (Cloudflare Pages limit: 20k files, we use 15k as safety)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3757370Z [36;1mMAX_FILES=15000[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3758461Z [36;1mif [ $TOTAL_FILES -gt $MAX_FILES ]; then[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3760409Z [36;1m  echo "❌ ERROR: Total files ($TOTAL_FILES) exceeds limit ($MAX_FILES)"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3762367Z [36;1m  echo "Clean up old files or adjust rolling window!"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3763750Z [36;1m  exit 1[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3764580Z [36;1mfi[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3765638Z [36;1mecho "✅ Total file count OK ($TOTAL_FILES/$MAX_FILES)"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3766970Z [36;1m[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3768160Z [36;1m# Check individual file sizes (max 25MB, we use 10MB as safety)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3769866Z [36;1mMAX_SIZE_MB=10[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3770978Z [36;1mMAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3772843Z [36;1mLARGE_FILES=$(find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M || true)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3774695Z [36;1mif [ ! -z "$LARGE_FILES" ]; then[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3775977Z [36;1m  echo "❌ ERROR: Files exceed ${MAX_SIZE_MB}MB:"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3777250Z [36;1m  echo "$LARGE_FILES"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3778921Z [36;1m  find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M -exec ls -lh {} \;[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3780582Z [36;1m  exit 1[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3781400Z [36;1mfi[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3782523Z [36;1mecho "✅ Individual file sizes OK (all < ${MAX_SIZE_MB}MB)"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3783911Z [36;1m[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3784986Z [36;1m# Check per-module file count (max 500 files per module)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3786436Z [36;1mMAX_FILES_PER_MODULE=500[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3787667Z [36;1mfor module_dir in public/data/snapshots/*/; do[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3789141Z [36;1m  if [ -d "$module_dir" ]; then[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3790347Z [36;1m    MODULE_NAME=$(basename "$module_dir")[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3791930Z [36;1m    MODULE_FILES=$(find "$module_dir" -type f -name "*.json" | wc -l)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3793680Z [36;1m    if [ $MODULE_FILES -gt $MAX_FILES_PER_MODULE ]; then[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3795657Z [36;1m      echo "❌ ERROR: Module $MODULE_NAME has $MODULE_FILES files (max $MAX_FILES_PER_MODULE)"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3797427Z [36;1m      exit 1[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3798310Z [36;1m    fi[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3799409Z [36;1m    echo "  ✓ $MODULE_NAME: $MODULE_FILES files"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3800618Z [36;1m  fi[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3801426Z [36;1mdone[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3802340Z [36;1mecho "✅ Per-module file count OK"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3803665Z [36;1m[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3804654Z [36;1m# Calculate total size[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3806048Z [36;1mTOTAL_SIZE=$(du -sb public/data 2>/dev/null | cut -f1 || true)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3807514Z [36;1mif [ -z "$TOTAL_SIZE" ]; then[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3809182Z [36;1m  TOTAL_SIZE=$(du -sk public/data 2>/dev/null | awk '{print $1 * 1024}' || true)[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3810759Z [36;1mfi[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3811600Z [36;1mTOTAL_SIZE=${TOTAL_SIZE:-0}[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3812800Z [36;1mTOTAL_SIZE_MB=$((TOTAL_SIZE / 1024 / 1024))[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3814093Z [36;1mecho "Total size: ${TOTAL_SIZE_MB}MB"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3815277Z [36;1m[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3816074Z [36;1m# Budget summary[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3816990Z [36;1mecho ""[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3817935Z [36;1mecho "═══════════════════════════════════════"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3819285Z [36;1mecho "         ASSET BUDGET SUMMARY"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3820514Z [36;1mecho "═══════════════════════════════════════"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3821874Z [36;1mecho "Total files:     $TOTAL_FILES / $MAX_FILES"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3823229Z [36;1mecho "Total size:      ${TOTAL_SIZE_MB}MB"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3824498Z [36;1mecho "Max file size:   < ${MAX_SIZE_MB}MB"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3825654Z [36;1mecho "Status:          ✅ PASS"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3826799Z [36;1mecho "═══════════════════════════════════════"[0m
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3863742Z shell: /usr/bin/bash -e {0}
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3864718Z ##[endgroup]
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3945265Z 🔍 Checking Asset Budget...
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3996803Z Total JSON files: 26
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.3997984Z ✅ Total file count OK (26/15000)
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4016224Z ✅ Individual file sizes OK (all < 10MB)
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4045580Z   ✓ market-prices: 1 files
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4046787Z ✅ Per-module file count OK
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4264882Z Total size: 2MB
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4265689Z 
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4266553Z ═══════════════════════════════════════
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4268520Z          ASSET BUDGET SUMMARY
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4270673Z ═══════════════════════════════════════
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4271887Z Total files:     26 / 15000
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4272969Z Total size:      2MB
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4273970Z Max file size:   < 10MB
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4275051Z Status:          ✅ PASS
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4276159Z ═══════════════════════════════════════
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.4457869Z Post job cleanup.
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5388243Z [command]/usr/bin/git version
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5423029Z git version 2.52.0
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5464730Z Temporarily overriding HOME='/home/runner/work/_temp/e43635b3-66ee-4b84-a4e2-a197f7f9579f' before making global git config changes
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5467739Z Adding repository directory to the temporary git global config as a safe directory
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5471196Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5504905Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5535992Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5760700Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5780626Z http.https://github.com/.extraheader
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5792674Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.5830873Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.6048970Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.6078436Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Asset Budget Check	UNKNOWN STEP	2026-02-09T14:47:05.6422333Z Cleaning up orphan processes
OPS Truth Validation (non-blocking)	UNKNOWN STEP	﻿2026-02-09T14:47:01.8919495Z Current runner version: '2.331.0'
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8948129Z ##[group]Runner Image Provisioner
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8948998Z Hosted Compute Agent
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8949576Z Version: 20260123.484
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8950126Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8950884Z Build Date: 2026-01-23T19:41:17Z
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8951511Z Worker ID: {d5e484d0-8689-457d-b3af-a4449095bab9}
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8952188Z Azure Region: eastus2
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8952673Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8954363Z ##[group]Operating System
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8955118Z Ubuntu
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8955832Z 24.04.3
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8956394Z LTS
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8956813Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8957286Z ##[group]Runner Image
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8957860Z Image: ubuntu-24.04
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8958835Z Version: 20260201.15.1
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8960883Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8963168Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8964608Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8969331Z ##[group]GITHUB_TOKEN Permissions
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8972153Z Actions: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8973164Z ArtifactMetadata: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8974003Z Attestations: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8974791Z Checks: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8976445Z Contents: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8977433Z Deployments: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8978243Z Discussions: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8979249Z Issues: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8980128Z Metadata: read
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8980922Z Models: read
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8981880Z Packages: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8982730Z Pages: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8983724Z PullRequests: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8984619Z RepositoryProjects: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8985942Z SecurityEvents: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8986941Z Statuses: write
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8987743Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8990718Z Secret source: Actions
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.8992155Z Prepare workflow directory
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.9467952Z Prepare all required actions
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:01.9524477Z Getting action download info
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.2625837Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.4692925Z Complete job name: OPS Truth Validation (non-blocking)
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5660792Z ##[group]Run actions/checkout@v4
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5661773Z with:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5662254Z   repository: RubikVault/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5663155Z   token: ***
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5663576Z   ssh-strict: true
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5664006Z   ssh-user: git
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5664445Z   persist-credentials: true
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5664928Z   clean: true
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5665360Z   sparse-checkout-cone-mode: true
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5666073Z   fetch-depth: 1
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5666491Z   fetch-tags: false
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5666927Z   show-progress: true
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5667415Z   lfs: false
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5667823Z   submodules: false
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5668262Z   set-safe-directory: true
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.5669007Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.6860440Z Syncing repository: RubikVault/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.6862723Z ##[group]Getting Git version info
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.6863768Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.6865084Z [command]/usr/bin/git version
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.6994176Z git version 2.52.0
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7021050Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7038960Z Temporarily overriding HOME='/home/runner/work/_temp/a75f5f09-8b12-40d5-818c-c5f036caf964' before making global git config changes
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7041624Z Adding repository directory to the temporary git global config as a safe directory
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7054928Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7106127Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7110470Z ##[group]Initializing the repository
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7116145Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7265901Z hint: Using 'master' as the name for the initial branch. This default branch name
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7267626Z hint: will change to "main" in Git 3.0. To configure the initial branch name
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7268858Z hint: to use in all of your new repositories, which will suppress this warning,
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7270099Z hint: call:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7270830Z hint:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7271819Z hint: 	git config --global init.defaultBranch <name>
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7272979Z hint:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7274064Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7276019Z hint: 'development'. The just-created branch can be renamed via this command:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7277492Z hint:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7278260Z hint: 	git branch -m <name>
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7279072Z hint:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7280165Z hint: Disable this message with "git config set advice.defaultBranchName false"
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7282238Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7286231Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7333394Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7334760Z ##[group]Disabling automatic garbage collection
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7336151Z [command]/usr/bin/git config --local gc.auto 0
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7366258Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7367666Z ##[group]Setting up auth
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7375081Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7410119Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7892224Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.7928693Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.8175303Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.8217827Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.8476633Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.8503755Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.8505023Z ##[group]Fetching the repository
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:02.8514043Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4501726Z From https://github.com/RubikVault/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4503417Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4544206Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4546134Z ##[group]Determining the checkout info
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4547376Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4549722Z [command]/usr/bin/git sparse-checkout disable
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4599315Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4631242Z ##[group]Checking out the ref
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.4634647Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.5796291Z Switched to a new branch 'main'
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.5798081Z branch 'main' set up to track 'origin/main'.
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.5815073Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.5859149Z [command]/usr/bin/git log -1 --format=%H
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.5885784Z 166a15246fc75b11da12b0f8504ef8fb77a01229
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6136761Z ##[group]Run if ! command -v jq >/dev/null 2>&1; then
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6138591Z [36;1mif ! command -v jq >/dev/null 2>&1; then[0m
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6140061Z [36;1m  sudo apt-get update[0m
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6141302Z [36;1m  sudo apt-get install -y jq[0m
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6142527Z [36;1mfi[0m
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6143455Z [36;1mjq --version[0m
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6185160Z shell: /usr/bin/bash -e {0}
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6186585Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6300458Z jq-1.7
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6385891Z ##[group]Run bash scripts/ops/validate-truth.sh
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6387425Z [36;1mbash scripts/ops/validate-truth.sh[0m
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6424273Z shell: /usr/bin/bash -e {0}
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6425318Z ##[endgroup]
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6578882Z OK: build-info ssot schema ok (build-info.json)
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6613057Z OK: pipeline latest schema ok (public/data/pipeline/nasdaq100.latest.json)
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6646413Z FAIL: pipeline stage fetched schema invalid at public/data/pipeline/nasdaq100.fetched.json
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6665025Z ##[error]Process completed with exit code 1.
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.6919546Z Post job cleanup.
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.7989624Z [command]/usr/bin/git version
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8031894Z git version 2.52.0
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8078683Z Temporarily overriding HOME='/home/runner/work/_temp/913ff47a-52bd-4a5c-933b-bcee85a32f8f' before making global git config changes
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8082014Z Adding repository directory to the temporary git global config as a safe directory
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8093387Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8133594Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8170663Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8416235Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8438901Z http.https://github.com/.extraheader
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8452283Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8490013Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8733364Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.8770580Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
OPS Truth Validation (non-blocking)	UNKNOWN STEP	2026-02-09T14:47:03.9145582Z Cleaning up orphan processes
JSON Schema Validation	UNKNOWN STEP	﻿2026-02-09T14:47:02.4712426Z Current runner version: '2.331.0'
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4736303Z ##[group]Runner Image Provisioner
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4737089Z Hosted Compute Agent
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4737606Z Version: 20260123.484
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4738148Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4738793Z Build Date: 2026-01-23T19:41:17Z
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4739386Z Worker ID: {1a3feb29-e7ea-4534-91ed-89226e2ae03d}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4739991Z Azure Region: westus3
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4740505Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4741735Z ##[group]Operating System
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4742456Z Ubuntu
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4743221Z 24.04.3
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4743647Z LTS
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4744055Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4744477Z ##[group]Runner Image
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4745005Z Image: ubuntu-24.04
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4745460Z Version: 20260201.15.1
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4746562Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4747788Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4748588Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4750815Z ##[group]GITHUB_TOKEN Permissions
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4753475Z Actions: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4753951Z ArtifactMetadata: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4754450Z Attestations: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4754857Z Checks: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4755355Z Contents: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4755766Z Deployments: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4756229Z Discussions: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4756685Z Issues: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4757125Z Metadata: read
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4757535Z Models: read
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4757993Z Packages: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4758432Z Pages: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4758944Z PullRequests: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4759448Z RepositoryProjects: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4759936Z SecurityEvents: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4760415Z Statuses: write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4760898Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4763048Z Secret source: Actions
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.4763971Z Prepare workflow directory
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.5067037Z Prepare all required actions
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:02.5106364Z Getting action download info
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.0021571Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.0748899Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.2648201Z Complete job name: JSON Schema Validation
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3258843Z ##[group]Run actions/checkout@v4
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3259661Z with:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3260134Z   repository: RubikVault/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3260835Z   token: ***
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3261275Z   ssh-strict: true
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3261741Z   ssh-user: git
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3262280Z   persist-credentials: true
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3262778Z   clean: true
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3263195Z   sparse-checkout-cone-mode: true
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3263700Z   fetch-depth: 1
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3264104Z   fetch-tags: false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3264575Z   show-progress: true
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3265000Z   lfs: false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3265390Z   submodules: false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3265869Z   set-safe-directory: true
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.3266555Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4402145Z Syncing repository: RubikVault/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4404104Z ##[group]Getting Git version info
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4405318Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4406990Z [command]/usr/bin/git version
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4407710Z git version 2.52.0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4409244Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4413343Z Temporarily overriding HOME='/home/runner/work/_temp/719d2890-bf19-405b-a0ec-5641a1bf665c' before making global git config changes
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4414474Z Adding repository directory to the temporary git global config as a safe directory
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4415478Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4431590Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4435055Z ##[group]Initializing the repository
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4439881Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4533208Z hint: Using 'master' as the name for the initial branch. This default branch name
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4534639Z hint: will change to "main" in Git 3.0. To configure the initial branch name
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4536011Z hint: to use in all of your new repositories, which will suppress this warning,
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4537110Z hint: call:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4537620Z hint:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4538189Z hint: 	git config --global init.defaultBranch <name>
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4538701Z hint:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4539188Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4539958Z hint: 'development'. The just-created branch can be renamed via this command:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4540589Z hint:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4540918Z hint: 	git branch -m <name>
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4541309Z hint:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4542006Z hint: Disable this message with "git config set advice.defaultBranchName false"
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4542953Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4548051Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4575782Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4576430Z ##[group]Disabling automatic garbage collection
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4579438Z [command]/usr/bin/git config --local gc.auto 0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4601951Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4602588Z ##[group]Setting up auth
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4607965Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4631085Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4924474Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.4949466Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.5116420Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.5144563Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.5327151Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.5358199Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.5359303Z ##[group]Fetching the repository
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:03.5367000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5573612Z From https://github.com/RubikVault/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5574782Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5602433Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5603612Z ##[group]Determining the checkout info
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5604943Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5610046Z [command]/usr/bin/git sparse-checkout disable
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5643970Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5665627Z ##[group]Checking out the ref
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.5670206Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6609508Z Switched to a new branch 'main'
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6610987Z branch 'main' set up to track 'origin/main'.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6622425Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6655238Z [command]/usr/bin/git log -1 --format=%H
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6674150Z 166a15246fc75b11da12b0f8504ef8fb77a01229
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6966072Z ##[group]Run actions/setup-node@v4
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6967174Z with:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6967954Z   node-version: 20
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6968810Z   always-auth: false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6969714Z   check-latest: false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6970921Z   token: ***
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.6971719Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.8624077Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:04.8630182Z ##[group]Environment details
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8318974Z node: v20.20.0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8319575Z npm: 10.8.2
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8320008Z yarn: 1.22.22
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8321488Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8419691Z ##[group]Run if ! command -v jq >/dev/null 2>&1; then
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8420225Z [36;1mif ! command -v jq >/dev/null 2>&1; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8420611Z [36;1m  sudo apt-get update[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8420964Z [36;1m  sudo apt-get install -y jq[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8421258Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8421473Z [36;1mjq --version[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8480038Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8480353Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8560108Z jq-1.7
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8590175Z ##[group]Run npm ci
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8590458Z [36;1mnpm ci[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8608597Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:07.8608873Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:10.0715301Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:10.1377416Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:11.5645002Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4176337Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4177084Z added 106 packages, and audited 107 packages in 7s
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4212616Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4212918Z 18 packages are looking for funding
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4213520Z   run `npm fund` for details
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4805094Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4805777Z 6 vulnerabilities (2 moderate, 4 high)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4806168Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4806552Z To address all issues (including breaking changes), run:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4807162Z   npm audit fix --force
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4807431Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4807643Z Run `npm audit` for details.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4958999Z ##[group]Run node scripts/ci/verify-artifacts.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4959356Z [36;1mnode scripts/ci/verify-artifacts.mjs[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4979463Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.4979715Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5308053Z ℹ public/data/snapshots/market-prices/latest.json: rows=517 record_count=517 asof=2026-02-07
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5312620Z ✅ market-prices snapshot: public/data/snapshots/market-prices/latest.json
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5340855Z ℹ public/data/forecast/latest.json: forecast_rows=517 asof=2026-02-08 status=stale
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5342217Z ✅ forecast latest: public/data/forecast/latest.json
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5343689Z ℹ public/data/forecast/system/status.json: status=stale circuit_state=closed reason=Using last_good forecasts: no fresh forecasts generated
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5345052Z ✅ forecast status: public/data/forecast/system/status.json
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5345475Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5345959Z ✅ Critical artifact semantic checks passed.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5393701Z ##[group]Run bash scripts/ci/forbid-kv-writes-in-api.sh
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5394094Z [36;1mbash scripts/ci/forbid-kv-writes-in-api.sh[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5414981Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5415250Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5474331Z scripts/ci/forbid-kv-writes-in-api.sh: line 7: rg: command not found
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5477548Z OK: no KV writes in functions/api
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5500740Z ##[group]Run npm run test:drop-threshold
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5501050Z [36;1mnpm run test:drop-threshold[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5501295Z [36;1mnpm run test:fetch-retry[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5501551Z [36;1mnpm run test:p2-build-id[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5501926Z [36;1mnpm run test:p3-kv-write[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5502138Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5502320Z [36;1mnpm run test:universe-registry[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5520844Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.5521078Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6530220Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6530746Z > test:drop-threshold
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6531171Z > node tests/drop-threshold.test.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6531386Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6813647Z ✅ Zero drops always passes
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6817870Z ✅ Drops below absolute threshold (5) should pass
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6818704Z ✅ Drops at absolute threshold (5) should pass
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6819560Z ✅ Drops above absolute threshold (5) should fail
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6820372Z ✅ Small dataset uses ratio threshold
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6821006Z ✅ Large dataset uses absolute threshold
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6822070Z ✅ computeValidationMetadata passes when below threshold
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6823037Z ✅ computeValidationMetadata fails when threshold exceeded
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6824113Z ✅ computeValidationMetadata fails when other validation fails
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6825408Z ✅ Single record dataset
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6825884Z ✅ Zero records dataset
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6827678Z ✅ Invalid inputs throw errors
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6828016Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6828291Z ==================================================
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6828843Z DROP THRESHOLD VALIDATION TEST RESULTS
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6829418Z ==================================================
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6831275Z ✅ Passed: 12
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6831743Z ❌ Failed: 0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6832368Z 📊 Total:  12
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6832894Z ==================================================
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6833338Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.6833619Z ✅ All tests passed!
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.7864234Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.7864727Z > test:fetch-retry
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.7865097Z > node tests/fetch-retry.test.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.7865305Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8155800Z 🧪 Running Fetch Retry Tests...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8156059Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8169911Z ✅ HTTP 429 with Retry-After → uses header value
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8171418Z ✅ HTTP 429 without Retry-After → exponential backoff
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8174779Z ✅ Network error → retry succeeds
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8177694Z ✅ Retry limit reached → ok=false with error
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8180422Z ✅ HTTP 400 → no retry
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8183640Z ✅ HTTP 500 → retries then succeeds
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8184811Z ✅ Successful first attempt → no retries
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8186857Z ✅ Network error exhausts retries → ok=false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8189055Z ✅ Custom policy parameters → respected
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8189980Z ✅ Upstream metadata always present
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8190292Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8190533Z ==================================================
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8190988Z FETCH RETRY TEST RESULTS
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8191437Z ==================================================
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8191989Z ✅ Passed: 10
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8192183Z ❌ Failed: 0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8192579Z 📊 Total:  10
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8192980Z ==================================================
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8193261Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.8193460Z ✅ All tests passed!
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.9178948Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.9180242Z > test:p2-build-id
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.9180757Z > node tests/p2-build-id.test.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.9181080Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:14.9470773Z p2 build_id test: SKIP (public/data/manifest.json not present)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.0482046Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.0482600Z > test:p3-kv-write
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.0483141Z > node tests/p3-kv-write-dedup.test.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.0483697Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.0770277Z p3 kv-write dedupe tests: OK
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.6758414Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.6758890Z > test:universe-registry
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.6759337Z > node scripts/validate/universe-registry.v1.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.6759676Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.7038607Z OK: universe registry v1 valid (symbols_total=600, source=data/symbols/universe.min.json)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.7133723Z ##[group]Run npm run test:contracts
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.7134010Z [36;1mnpm run test:contracts[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.7152907Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.7153151Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.8109273Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.8109555Z > test:contracts
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.8110916Z > npm run validate:symbols && npm run test:envelope && npm run test:scheduler && node scripts/contract-smoke.js && npm run test:truth-chain && npm run test:missing-mirror && node tests/build-info-artifact.test.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.8111700Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.9098565Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.9099055Z > validate:symbols
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.9099428Z > node scripts/validate-symbols.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:15.9099638Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.0037903Z ✅ symbols.json validation passed
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1081950Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1083291Z > test:envelope
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1084057Z > node scripts/test-envelope.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1084596Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1380639Z ✅ okEnvelope
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1384826Z ✅ errorEnvelope
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1387971Z ✅ ensureEnvelopePayload
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1388848Z ✅ assertEnvelope rejects invalid status
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1390291Z ✅ ensureEnvelopePayload 404 produces ok=false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1390886Z ✅ ensureEnvelopePayload 500 produces ok=false
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1393015Z ✅ ensureEnvelopePayload provides fallback provider
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1393827Z ✅ assertEnvelope rejects null meta
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1395753Z ✅ cache meta builder
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1397804Z ✅ redact public debug
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1884989Z ✅ debug guards
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.1885369Z ✅ envelope tests passed
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.2909670Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.2910154Z > test:scheduler
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.2910652Z > node scripts/test-scheduler.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.2910940Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3268407Z (node:2459) V8: file:///home/runner/work/rubikvault-site/rubikvault-site/functions/api/_shared/eod-providers.mjs:6 'assert' is deprecated in import statements and support will be removed in a future version; use 'with' instead
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3269466Z (Use `node --trace-warnings ...` to show where the warning was created)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3536205Z ✅ scheduler health stale
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3550215Z ✅ scheduler run rejects without token
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3565484Z (node:2459) V8: file:///home/runner/work/rubikvault-site/rubikvault-site/functions/api/_shared/scheduler-law.js:71 'assert' is deprecated in import statements and support will be removed in a future version; use 'with' instead
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3589777Z ✅ scheduler run ok; health remains stale without KV writes
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3602918Z ✅ scheduler run accepts bearer token
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.3603478Z ✅ scheduler tests passed
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.4163068Z WARN: health latest snapshot check skipped (missing public/data/snapshots/health/latest.json)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.4166588Z WARN: tech-signals contract check skipped (missing mirror or snapshot artifact)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.4167318Z WARN: SNAPSHOT>=MIRROR tech-signals guard skipped (missing mirror or snapshot artifact)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.4168263Z Contract smoke OK
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.5131014Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.5131523Z > test:truth-chain
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.5132138Z > node scripts/test-truth-chain.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.5132395Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.5448372Z (node:2493) V8: file:///home/runner/work/rubikvault-site/rubikvault-site/functions/api/mission-control/summary.js:12 'assert' is deprecated in import statements and support will be removed in a future version; use 'with' instead
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.5449581Z (Use `node --trace-warnings ...` to show where the warning was created)
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.6429366Z Truth chain test OK
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.7484716Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.7485312Z > test:missing-mirror
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.7486032Z > node scripts/ops/verify-missing-mirror-semantic.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.7486515Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.7763437Z WARN: semantic equivalence check skipped (generated artifacts missing): /home/runner/work/rubikvault-site/rubikvault-site/public/data/marketphase/missing.json
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8063024Z SKIP: build-info artifact missing in generated-only checkout
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8164929Z ##[group]Run node scripts/eod/check-eod-artifacts.mjs
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8165333Z [36;1mnode scripts/eod/check-eod-artifacts.mjs[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8183908Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8184141Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8480864Z OK: eod manifest + pipeline latest present and consistent
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8530306Z ##[group]Run echo "🔍 Validating against JSON Schemas..."
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8530690Z [36;1mecho "🔍 Validating against JSON Schemas..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8530964Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8531137Z [36;1m# Validate manifest[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8531503Z [36;1mif [ -f public/data/manifest.json ] && [ -f schemas/manifest.schema.json ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8532121Z [36;1m  echo "Validating manifest.json..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8532554Z [36;1m  npx --yes ajv-cli@5 validate -s schemas/manifest.schema.json -d public/data/manifest.json[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8532945Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8533105Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8533267Z [36;1m# Validate provider-state[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8533674Z [36;1mif [ -f public/data/provider-state.json ] && [ -f schemas/provider-state.schema.json ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8534123Z [36;1m  echo "Validating provider-state.json..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8534642Z [36;1m  npx --yes ajv-cli@5 validate -s schemas/provider-state.schema.json -d public/data/provider-state.json[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8535064Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8535225Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8535381Z [36;1m# Validate snapshots[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8535653Z [36;1mif [ -f schemas/snapshot-envelope.schema.json ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8535975Z [36;1m  echo "Validating snapshot envelopes..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8536299Z [36;1m  for snapshot in public/data/snapshots/*/latest.json; do[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8536607Z [36;1m    if [ -f "$snapshot" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8536851Z [36;1m      echo "  Validating $snapshot..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8537253Z [36;1m      npx --yes ajv-cli@5 validate -s schemas/snapshot-envelope.schema.json -d "$snapshot"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8537622Z [36;1m    fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8537780Z [36;1m  done[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8537935Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8538079Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8538273Z [36;1mecho "✅ JSON Schema validation complete"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8557360Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8557586Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8596521Z 🔍 Validating against JSON Schemas...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8597088Z Validating snapshot envelopes...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:16.8597652Z   Validating public/data/snapshots/market-prices/latest.json...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3504967Z public/data/snapshots/market-prices/latest.json valid
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3596900Z ✅ JSON Schema validation complete
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3619230Z ##[group]Run echo "🔍 Validating JSON Schemas..."
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3619622Z [36;1mecho "🔍 Validating JSON Schemas..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3619866Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3620034Z [36;1m# Check if files are valid JSON[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3620272Z [36;1mINVALID_COUNT=0[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3620450Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3620626Z [36;1mecho "Checking manifest.json..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3620910Z [36;1mif [ -f public/data/manifest.json ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3621240Z [36;1m  if ! jq empty public/data/manifest.json 2>/dev/null; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3621563Z [36;1m    echo "❌ manifest.json is invalid JSON"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3622201Z [36;1m    INVALID_COUNT=$((INVALID_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3622445Z [36;1m  else[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3622620Z [36;1m    echo "✅ manifest.json valid"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3622854Z [36;1m    [0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3623029Z [36;1m    # Check required fields[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3623439Z [36;1m    SCHEMA_VERSION=$(jq -r '.schema_version // "missing"' public/data/manifest.json)[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3623829Z [36;1m    if [ "$SCHEMA_VERSION" != "3.0" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3624210Z [36;1m      echo "❌ manifest.json: schema_version should be '3.0', got '$SCHEMA_VERSION'"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3624596Z [36;1m      INVALID_COUNT=$((INVALID_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3624841Z [36;1m    fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3624994Z [36;1m    [0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3625300Z [36;1m    ACTIVE_BUILD_ID=$(jq -r '.active_build_id // "missing"' public/data/manifest.json)[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3625746Z [36;1m    if [ "$ACTIVE_BUILD_ID" = "missing" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3626106Z [36;1m      echo "⚠️ manifest.json: active_build_id is missing (optional for now)"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3626442Z [36;1m    fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3626593Z [36;1m  fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3626753Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3626899Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3627057Z [36;1mecho ""[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3627268Z [36;1mecho "Checking provider-state.json..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3627577Z [36;1mif [ -f public/data/provider-state.json ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3627945Z [36;1m  if ! jq empty public/data/provider-state.json 2>/dev/null; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3628308Z [36;1m    echo "❌ provider-state.json is invalid JSON"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3628604Z [36;1m    INVALID_COUNT=$((INVALID_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3628835Z [36;1m  else[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3629028Z [36;1m    echo "✅ provider-state.json valid"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3629270Z [36;1m  fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3629430Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3629582Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3629727Z [36;1mecho ""[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3629920Z [36;1mecho "Checking module snapshots..."[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3630161Z [36;1mSNAPSHOT_COUNT=0[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3630443Z [36;1mfor snapshot in public/data/snapshots/*/latest.json; do[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3630753Z [36;1m  if [ -f "$snapshot" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3631017Z [36;1m    SNAPSHOT_COUNT=$((SNAPSHOT_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3631313Z [36;1m    MODULE_NAME=$(basename $(dirname "$snapshot"))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3631564Z [36;1m    [0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3631859Z [36;1m    if ! jq empty "$snapshot" 2>/dev/null; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3632331Z [36;1m      echo "❌ $MODULE_NAME: latest.json is invalid JSON"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3632792Z [36;1m      INVALID_COUNT=$((INVALID_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3633127Z [36;1m    else[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3633404Z [36;1m      # Check required envelope fields[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3633931Z [36;1m      SCHEMA_VERSION=$(jq -r '.schema_version // "missing"' "$snapshot")[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3634367Z [36;1m      if [ "$SCHEMA_VERSION" != "3.0" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3634743Z [36;1m        echo "⚠️ $MODULE_NAME: schema_version is '$SCHEMA_VERSION' (expected '3.0')"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3635280Z [36;1m      fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3635450Z [36;1m      [0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3635623Z [36;1m      # Check metadata exists[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3635910Z [36;1m      HAS_METADATA=$(jq 'has("metadata")' "$snapshot")[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3636217Z [36;1m      if [ "$HAS_METADATA" != "true" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3636517Z [36;1m        echo "❌ $MODULE_NAME: missing 'metadata' field"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3636829Z [36;1m        INVALID_COUNT=$((INVALID_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3713100Z [36;1m      fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3713642Z [36;1m      [0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3713960Z [36;1m      # Check data field exists[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3714696Z [36;1m      HAS_DATA=$(jq 'has("data")' "$snapshot")[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3715155Z [36;1m      if [ "$HAS_DATA" != "true" ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3715672Z [36;1m        echo "❌ $MODULE_NAME: missing 'data' field"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3716228Z [36;1m        INVALID_COUNT=$((INVALID_COUNT + 1))[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3716647Z [36;1m      fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3716882Z [36;1m      [0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3717144Z [36;1m      echo "✅ $MODULE_NAME valid"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3717540Z [36;1m    fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3717778Z [36;1m  fi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3718001Z [36;1mdone[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3718217Z [36;1m[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3718458Z [36;1mecho ""[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3718770Z [36;1mecho "═══════════════════════════════════════"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3719194Z [36;1mecho "      SCHEMA VALIDATION SUMMARY"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3719615Z [36;1mecho "═══════════════════════════════════════"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3720077Z [36;1mecho "Snapshots checked: $SNAPSHOT_COUNT"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3720549Z [36;1mecho "Invalid files:     $INVALID_COUNT"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3720995Z [36;1mif [ $INVALID_COUNT -gt 0 ]; then[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3721388Z [36;1m  echo "Status:            ❌ FAIL"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3721732Z [36;1m  exit 1[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3722187Z [36;1melse[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3722493Z [36;1m  echo "Status:            ✅ PASS"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3722886Z [36;1mfi[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3723275Z [36;1mecho "═══════════════════════════════════════"[0m
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3747471Z shell: /usr/bin/bash -e {0}
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3747719Z ##[endgroup]
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3787869Z 🔍 Validating JSON Schemas...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3788241Z Checking manifest.json...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3788492Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3788719Z Checking provider-state.json...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3789002Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.3789136Z Checking module snapshots...
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4215407Z ✅ market-prices valid
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4215767Z 
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4216025Z ═══════════════════════════════════════
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4216308Z       SCHEMA VALIDATION SUMMARY
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4216651Z ═══════════════════════════════════════
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4217229Z Snapshots checked: 1
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4217582Z Invalid files:     0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4217997Z Status:            ✅ PASS
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4218509Z ═══════════════════════════════════════
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.4277535Z Post job cleanup.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.5837283Z Post job cleanup.
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6724198Z [command]/usr/bin/git version
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6757344Z git version 2.52.0
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6796605Z Temporarily overriding HOME='/home/runner/work/_temp/d18b0c0c-a8b3-4e5a-88bf-8c34907a4e64' before making global git config changes
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6797397Z Adding repository directory to the temporary git global config as a safe directory
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6801903Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6834697Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.6862858Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7049739Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7068178Z http.https://github.com/.extraheader
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7078900Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7104160Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7283196Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7310187Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
JSON Schema Validation	UNKNOWN STEP	2026-02-09T14:47:17.7577104Z Cleaning up orphan processes
Manifest Integrity Check	UNKNOWN STEP	﻿2026-02-09T14:47:25.0315557Z Current runner version: '2.331.0'
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0340036Z ##[group]Runner Image Provisioner
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0340822Z Hosted Compute Agent
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0341492Z Version: 20260123.484
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0342055Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0342735Z Build Date: 2026-01-23T19:41:17Z
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0343413Z Worker ID: {836f5c34-cb4f-433b-b13c-d01be373b4ac}
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0344144Z Azure Region: westcentralus
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0344712Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0346167Z ##[group]Operating System
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0346779Z Ubuntu
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0347204Z 24.04.3
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0347695Z LTS
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0348165Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0348663Z ##[group]Runner Image
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0349591Z Image: ubuntu-24.04
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0350104Z Version: 20260201.15.1
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0351237Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0352724Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0353611Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0356634Z ##[group]GITHUB_TOKEN Permissions
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0358860Z Actions: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0359824Z ArtifactMetadata: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0360453Z Attestations: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0360969Z Checks: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0361516Z Contents: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0362038Z Deployments: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0362577Z Discussions: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0363068Z Issues: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0363602Z Metadata: read
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0364049Z Models: read
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0364526Z Packages: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0365008Z Pages: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0365677Z PullRequests: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0366211Z RepositoryProjects: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0366774Z SecurityEvents: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0367303Z Statuses: write
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0367775Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0370070Z Secret source: Actions
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0370812Z Prepare workflow directory
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0701053Z Prepare all required actions
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.0740185Z Getting action download info
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.4781994Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.5604308Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.7494793Z Complete job name: Manifest Integrity Check
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8165186Z ##[group]Run actions/checkout@v4
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8165998Z with:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8166412Z   repository: RubikVault/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8167078Z   token: ***
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8167522Z   ssh-strict: true
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8167915Z   ssh-user: git
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8168304Z   persist-credentials: true
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8168738Z   clean: true
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8169270Z   sparse-checkout-cone-mode: true
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8169762Z   fetch-depth: 1
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8170135Z   fetch-tags: false
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8170528Z   show-progress: true
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8170917Z   lfs: false
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8171277Z   submodules: false
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8171670Z   set-safe-directory: true
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.8172532Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9244989Z Syncing repository: RubikVault/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9246684Z ##[group]Getting Git version info
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9247497Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9248527Z [command]/usr/bin/git version
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9315954Z git version 2.52.0
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9342321Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9356981Z Temporarily overriding HOME='/home/runner/work/_temp/a91f6cae-56a7-4b4e-a41c-ef955e193ad7' before making global git config changes
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9358309Z Adding repository directory to the temporary git global config as a safe directory
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9369899Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9407752Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9411786Z ##[group]Initializing the repository
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9415756Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9511560Z hint: Using 'master' as the name for the initial branch. This default branch name
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9513252Z hint: will change to "main" in Git 3.0. To configure the initial branch name
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9514782Z hint: to use in all of your new repositories, which will suppress this warning,
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9515952Z hint: call:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9516521Z hint:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9517257Z hint: 	git config --global init.defaultBranch <name>
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9517928Z hint:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9518455Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9519570Z hint: 'development'. The just-created branch can be renamed via this command:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9520275Z hint:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9520651Z hint: 	git branch -m <name>
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9521075Z hint:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9521744Z hint: Disable this message with "git config set advice.defaultBranchName false"
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9523177Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9527467Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9559767Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9560486Z ##[group]Disabling automatic garbage collection
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9563774Z [command]/usr/bin/git config --local gc.auto 0
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9591914Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9592569Z ##[group]Setting up auth
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9598265Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9627373Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9946754Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:25.9974716Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.0206665Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.0244386Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.0462839Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.0495550Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.0496315Z ##[group]Fetching the repository
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.0504272Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9197265Z From https://github.com/RubikVault/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9199349Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9235054Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9236348Z ##[group]Determining the checkout info
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9238111Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9242362Z [command]/usr/bin/git sparse-checkout disable
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9284846Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9315822Z ##[group]Checking out the ref
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:26.9317610Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0443033Z Switched to a new branch 'main'
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0446369Z branch 'main' set up to track 'origin/main'.
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0460179Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0498651Z [command]/usr/bin/git log -1 --format=%H
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0521488Z 166a15246fc75b11da12b0f8504ef8fb77a01229
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0835747Z ##[group]Run actions/setup-node@v4
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0836840Z with:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0837602Z   node-version: 20
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0838454Z   always-auth: false
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0839474Z   check-latest: false
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0840637Z   token: ***
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.0841435Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.2681137Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.2688680Z ##[group]Environment details
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.5902325Z node: v20.20.0
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.5902966Z npm: 10.8.2
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.5903402Z yarn: 1.22.22
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.5904647Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.6023102Z ##[group]Run npm ci
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.6023435Z [36;1mnpm ci[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.6067615Z shell: /usr/bin/bash -e {0}
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:27.6067949Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:29.0840660Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:29.1054418Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:30.7213809Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.8517941Z 
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.8518656Z added 106 packages, and audited 107 packages in 6s
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.8522062Z 
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.8522689Z 18 packages are looking for funding
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.8524178Z   run `npm fund` for details
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9261825Z 
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9264351Z 6 vulnerabilities (2 moderate, 4 high)
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9264737Z 
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9265432Z To address all issues (including breaking changes), run:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9266312Z   npm audit fix --force
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9272597Z 
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9272911Z Run `npm audit` for details.
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9544665Z ##[group]Run echo "🔍 Checking Manifest Integrity..."
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9545118Z [36;1mecho "🔍 Checking Manifest Integrity..."[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9545406Z [36;1m[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9545628Z [36;1mif [ ! -f public/data/manifest.json ]; then[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9546004Z [36;1m  echo "⚠️ manifest.json not found (expected for first run)"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9546344Z [36;1m  exit 0[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9546526Z [36;1mfi[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9546692Z [36;1m[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9546882Z [36;1m# Get published modules from manifest[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9547443Z [36;1mPUBLISHED_MODULES=$(jq -r '.modules | to_entries | .[] | select(.value.published == true) | .key' public/data/manifest.json)[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9547955Z [36;1m[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9548139Z [36;1mif [ -z "$PUBLISHED_MODULES" ]; then[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9548462Z [36;1m  echo "No published modules in manifest"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9548722Z [36;1m  exit 0[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9548949Z [36;1mfi[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9549390Z [36;1m[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9549667Z [36;1mMISMATCH_COUNT=0[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9549866Z [36;1m[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9550057Z [36;1mfor module in $PUBLISHED_MODULES; do[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9550322Z [36;1m  echo "Checking $module..."[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9550597Z [36;1m  [0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9550768Z [36;1m  # Get digest from manifest[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9551152Z [36;1m  MANIFEST_DIGEST=$(jq -r ".modules[\"$module\"].digest" public/data/manifest.json)[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9551528Z [36;1m  [0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9551705Z [36;1m  # Check if snapshot exists[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9552110Z [36;1m  SNAPSHOT_PATH="public/data/snapshots/$module/latest.json"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9552500Z [36;1m  if [ ! -f "$SNAPSHOT_PATH" ]; then[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9553084Z [36;1m    echo "❌ $module: snapshot missing but marked as published"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9553444Z [36;1m    MISMATCH_COUNT=$((MISMATCH_COUNT + 1))[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9553715Z [36;1m    continue[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9553894Z [36;1m  fi[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9554055Z [36;1m  [0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9554235Z [36;1m  # Get digest from snapshot[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9554555Z [36;1m  SNAPSHOT_DIGEST=$(jq -r '.metadata.digest' "$SNAPSHOT_PATH")[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9554877Z [36;1m  [0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9555037Z [36;1m  # Compare[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9555289Z [36;1m  if [ "$MANIFEST_DIGEST" != "$SNAPSHOT_DIGEST" ]; then[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9622406Z [36;1m    echo "❌ $module: digest mismatch"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9622951Z [36;1m    echo "  Manifest: $MANIFEST_DIGEST"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9623501Z [36;1m    echo "  Snapshot: $SNAPSHOT_DIGEST"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9624107Z [36;1m    MISMATCH_COUNT=$((MISMATCH_COUNT + 1))[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9624631Z [36;1m  else[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9625042Z [36;1m    echo "✅ $module: digest match"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9625499Z [36;1m  fi[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9625785Z [36;1mdone[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9626056Z [36;1m[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9626303Z [36;1mecho ""[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9626676Z [36;1mecho "═══════════════════════════════════════"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9627218Z [36;1mecho "    MANIFEST INTEGRITY SUMMARY"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9627808Z [36;1mecho "═══════════════════════════════════════"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9628459Z [36;1mecho "Modules checked: $(echo "$PUBLISHED_MODULES" | wc -l)"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9629326Z [36;1mecho "Mismatches:      $MISMATCH_COUNT"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9629861Z [36;1mif [ $MISMATCH_COUNT -gt 0 ]; then[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9630329Z [36;1m  echo "Status:          ❌ FAIL"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9630749Z [36;1m  echo ""[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9631197Z [36;1m  echo "CRITICAL: Manifest-Asset integrity violated!"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9631916Z [36;1m  echo "This indicates non-atomic publish or corruption."[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9632532Z [36;1m  echo "DO NOT DEPLOY until fixed!"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9633258Z [36;1m  exit 1[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9633565Z [36;1melse[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9633880Z [36;1m  echo "Status:          ✅ PASS"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9634308Z [36;1mfi[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9634699Z [36;1mecho "═══════════════════════════════════════"[0m
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9671727Z shell: /usr/bin/bash -e {0}
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9671978Z ##[endgroup]
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9731694Z 🔍 Checking Manifest Integrity...
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9732613Z ⚠️ manifest.json not found (expected for first run)
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:33.9803945Z Post job cleanup.
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.1482423Z Post job cleanup.
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2418943Z [command]/usr/bin/git version
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2458329Z git version 2.52.0
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2502306Z Temporarily overriding HOME='/home/runner/work/_temp/018f004a-a46a-407c-bc3c-9fff9f5f8591' before making global git config changes
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2503945Z Adding repository directory to the temporary git global config as a safe directory
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2508981Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2552958Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2589302Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2832418Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2857035Z http.https://github.com/.extraheader
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2871195Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.2906300Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.3138666Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.3172385Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Manifest Integrity Check	UNKNOWN STEP	2026-02-09T14:47:34.3510942Z Cleaning up orphan processes
CI Gates Summary	UNKNOWN STEP	﻿2026-02-09T14:47:40.6664742Z Current runner version: '2.331.0'
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6688065Z ##[group]Runner Image Provisioner
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6688866Z Hosted Compute Agent
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6689377Z Version: 20260123.484
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6690435Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6691148Z Build Date: 2026-01-23T19:41:17Z
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6691778Z Worker ID: {a7ccaee7-dc7e-43d5-9b08-cdd5d7048492}
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6692533Z Azure Region: centralus
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6693088Z ##[endgroup]
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6694561Z ##[group]Operating System
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6695148Z Ubuntu
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6695760Z 24.04.3
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6696169Z LTS
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6696645Z ##[endgroup]
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6697203Z ##[group]Runner Image
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6697729Z Image: ubuntu-24.04
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6698231Z Version: 20260201.15.1
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6699422Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6701141Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6702134Z ##[endgroup]
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6704840Z ##[group]GITHUB_TOKEN Permissions
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6707206Z Actions: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6707772Z ArtifactMetadata: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6708271Z Attestations: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6709193Z Checks: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6709820Z Contents: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6710334Z Deployments: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6710843Z Discussions: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6711378Z Issues: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6711854Z Metadata: read
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6712368Z Models: read
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6712872Z Packages: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6713325Z Pages: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6713951Z PullRequests: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6714465Z RepositoryProjects: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6715055Z SecurityEvents: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6715534Z Statuses: write
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6716111Z ##[endgroup]
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6718624Z Secret source: Actions
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.6719898Z Prepare workflow directory
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7040913Z Prepare all required actions
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7135468Z Complete job name: CI Gates Summary
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7851586Z ##[group]Run echo "## CI Gates Summary" >> $GITHUB_STEP_SUMMARY
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7852610Z [36;1mecho "## CI Gates Summary" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7853488Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7854186Z [36;1mecho "- Asset Budget: success" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7855106Z [36;1mecho "- Schema Validation: success" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7856014Z [36;1mecho "- Manifest Integrity: success" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7856830Z [36;1mecho "- Repo Policies: success" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.7857732Z [36;1mecho "- OPS Truth Validation: success" >> $GITHUB_STEP_SUMMARY[0m
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.8534942Z shell: /usr/bin/bash -e {0}
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.8535923Z ##[endgroup]
CI Gates Summary	UNKNOWN STEP	2026-02-09T14:47:40.8852031Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Cleanup Daily Snapshots
```
latest_run_id=21792234114
cleanup	UNKNOWN STEP	﻿2026-02-08T04:28:20.9962286Z Current runner version: '2.331.0'
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9989099Z ##[group]Runner Image Provisioner
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9989884Z Hosted Compute Agent
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9990424Z Version: 20260123.484
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9991086Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9991785Z Build Date: 2026-01-23T19:41:17Z
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9992407Z Worker ID: {05ea67e3-6c4e-4983-a31f-2bfc669bc470}
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9993364Z Azure Region: eastus2
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9993904Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9995265Z ##[group]Operating System
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9995941Z Ubuntu
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9996400Z 24.04.3
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9996924Z LTS
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9997443Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9997973Z ##[group]Runner Image
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9998525Z Image: ubuntu-24.04
cleanup	UNKNOWN STEP	2026-02-08T04:28:20.9999039Z Version: 20260201.15.1
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0000200Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0001740Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0002808Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0003808Z ##[group]GITHUB_TOKEN Permissions
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0005699Z Contents: write
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0006266Z Metadata: read
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0006783Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0009121Z Secret source: Actions
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0009869Z Prepare workflow directory
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0338512Z Prepare all required actions
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.0377642Z Getting action download info
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.3488968Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.5511751Z Complete job name: cleanup
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6313257Z ##[group]Run actions/checkout@v4
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6314139Z with:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6314577Z   repository: RubikVault/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6315265Z   token: ***
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6315656Z   ssh-strict: true
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6316087Z   ssh-user: git
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6316501Z   persist-credentials: true
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6316962Z   clean: true
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6317375Z   sparse-checkout-cone-mode: true
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6317860Z   fetch-depth: 1
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6318270Z   fetch-tags: false
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6318688Z   show-progress: true
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6319097Z   lfs: false
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6319480Z   submodules: false
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6319902Z   set-safe-directory: true
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.6320545Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7423060Z Syncing repository: RubikVault/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7425007Z ##[group]Getting Git version info
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7425902Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7426938Z [command]/usr/bin/git version
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7518681Z git version 2.52.0
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7546759Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7562375Z Temporarily overriding HOME='/home/runner/work/_temp/8dcd3777-b190-44a7-b48b-85710fdb0c9b' before making global git config changes
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7564660Z Adding repository directory to the temporary git global config as a safe directory
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7577522Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7621491Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7625546Z ##[group]Initializing the repository
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7629835Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7750578Z hint: Using 'master' as the name for the initial branch. This default branch name
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7752419Z hint: will change to "main" in Git 3.0. To configure the initial branch name
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7754255Z hint: to use in all of your new repositories, which will suppress this warning,
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7755572Z hint: call:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7756144Z hint:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7756839Z hint: 	git config --global init.defaultBranch <name>
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7757779Z hint:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7758383Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7759385Z hint: 'development'. The just-created branch can be renamed via this command:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7760185Z hint:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7760590Z hint: 	git branch -m <name>
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7761154Z hint:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7762076Z hint: Disable this message with "git config set advice.defaultBranchName false"
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7763520Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7768881Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7807058Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7807790Z ##[group]Disabling automatic garbage collection
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7811629Z [command]/usr/bin/git config --local gc.auto 0
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7841105Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7841809Z ##[group]Setting up auth
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7848630Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.7880474Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8242335Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8273495Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8502166Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8538806Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8774769Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8810009Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8811262Z ##[group]Fetching the repository
cleanup	UNKNOWN STEP	2026-02-08T04:28:21.8819850Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +ed5b407c5c853cbd087c2bfbe0693dc0e507e12d:refs/remotes/origin/main
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1150036Z From https://github.com/RubikVault/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1151584Z  * [new ref]         ed5b407c5c853cbd087c2bfbe0693dc0e507e12d -> origin/main
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1183248Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1183985Z ##[group]Determining the checkout info
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1186860Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1192986Z [command]/usr/bin/git sparse-checkout disable
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1233395Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1258218Z ##[group]Checking out the ref
cleanup	UNKNOWN STEP	2026-02-08T04:30:51.1262911Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.1767320Z Updating files:  49% (806/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.2371324Z Updating files:  50% (819/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.2957212Z Updating files:  51% (835/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.3627915Z Updating files:  52% (852/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.4154527Z Updating files:  53% (868/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.4820365Z Updating files:  54% (884/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.5245190Z Updating files:  55% (901/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.5858752Z Updating files:  56% (917/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.6325725Z Updating files:  57% (934/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.6868491Z Updating files:  58% (950/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.7643939Z Updating files:  59% (966/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.8160075Z Updating files:  60% (983/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.8733383Z Updating files:  61% (999/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.9272902Z Updating files:  62% (1015/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:52.9874622Z Updating files:  63% (1032/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.0467606Z Updating files:  64% (1048/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.0929625Z Updating files:  65% (1065/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.1318452Z Updating files:  66% (1081/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.1703868Z Updating files:  66% (1090/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2190183Z Updating files:  67% (1097/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2201013Z Updating files:  68% (1114/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2208408Z Updating files:  69% (1130/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2222837Z Updating files:  70% (1146/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2230558Z Updating files:  71% (1163/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2238435Z Updating files:  72% (1179/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2245984Z Updating files:  73% (1196/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2253765Z Updating files:  74% (1212/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2261417Z Updating files:  75% (1228/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2273317Z Updating files:  76% (1245/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2284018Z Updating files:  77% (1261/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2297002Z Updating files:  78% (1277/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2311233Z Updating files:  79% (1294/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2317069Z Updating files:  80% (1310/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2324761Z Updating files:  81% (1326/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2336609Z Updating files:  82% (1343/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2349297Z Updating files:  83% (1359/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2362487Z Updating files:  84% (1376/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2373905Z Updating files:  85% (1392/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2385364Z Updating files:  86% (1408/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2395490Z Updating files:  87% (1425/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2403550Z Updating files:  88% (1441/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2413677Z Updating files:  89% (1457/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2421316Z Updating files:  90% (1474/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2431581Z Updating files:  91% (1490/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2443654Z Updating files:  92% (1507/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2449474Z Updating files:  93% (1523/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2461707Z Updating files:  94% (1539/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2473711Z Updating files:  95% (1556/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2481963Z Updating files:  96% (1572/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2493627Z Updating files:  97% (1588/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2513795Z Updating files:  98% (1605/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2521320Z Updating files:  99% (1621/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2522022Z Updating files: 100% (1637/1637)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2522786Z Updating files: 100% (1637/1637), done.
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2547322Z Switched to a new branch 'main'
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2550824Z branch 'main' set up to track 'origin/main'.
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2667172Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2713827Z [command]/usr/bin/git log -1 --format=%H
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2738493Z ed5b407c5c853cbd087c2bfbe0693dc0e507e12d
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2952134Z ##[group]Run echo "🗑️  Running cleanup script..."
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2952776Z [36;1mecho "🗑️  Running cleanup script..."[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2953096Z [36;1mecho "Days to keep: $DAYS_TO_KEEP"[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2953367Z [36;1mecho "Dry run: $DRY_RUN"[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2953601Z [36;1m[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2953798Z [36;1m# Make script executable[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2954092Z [36;1mchmod +x scripts/cleanup-daily-snapshots.sh[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2954363Z [36;1m[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2954527Z [36;1m# Run cleanup[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2954799Z [36;1m./scripts/cleanup-daily-snapshots.sh "$DAYS_TO_KEEP"[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2990525Z shell: /usr/bin/bash -e {0}
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2990789Z env:
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2990953Z   DAYS_TO_KEEP: 7
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2991148Z   DRY_RUN: false
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.2991325Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3061249Z 🗑️  Running cleanup script...
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3061511Z Days to keep: 7
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3061739Z Dry run: false
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3101524Z ═══════════════════════════════════════════════════════════
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3101886Z            ROLLING WINDOW CLEANUP SCRIPT
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3102262Z ═══════════════════════════════════════════════════════════
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3102867Z Base directory:    /home/runner/work/rubikvault-site/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3103768Z Snapshots directory: /home/runner/work/rubikvault-site/rubikvault-site/public/data/snapshots
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3104245Z Days to keep:      7
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3104445Z Dry run:           false
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3104578Z 
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3115286Z Cutoff date:       2026-02-01
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3115590Z Files older than this will be deleted.
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3115779Z 
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3234454Z 
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3235007Z ═══════════════════════════════════════════════════════════
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3235436Z                     CLEANUP SUMMARY
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3236000Z ═══════════════════════════════════════════════════════════
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3236345Z Total daily files:  0
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3236543Z Old files:          0
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3236741Z Bytes saved:        0 KB
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3236961Z latest.json count:  8 (should be > 0)
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3237144Z 
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3237371Z ✅ No old files to clean up. All files are within retention window.
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3237846Z ═══════════════════════════════════════════════════════════
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3269587Z ##[group]Run if git diff --quiet public/data; then
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3270007Z [36;1mif git diff --quiet public/data; then[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3270371Z [36;1m  echo "changed=false" >> $GITHUB_OUTPUT[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3270695Z [36;1m  echo "No files deleted"[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3270974Z [36;1melse[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3271239Z [36;1m  echo "changed=true" >> $GITHUB_OUTPUT[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3271575Z [36;1m  echo "Changes detected:"[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3271886Z [36;1m  git diff --stat public/data[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3272198Z [36;1mfi[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3303635Z shell: /usr/bin/bash -e {0}
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.3303933Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5161306Z No files deleted
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5250248Z ##[group]Run echo "## Cleanup Summary" >> $GITHUB_STEP_SUMMARY
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5250654Z [36;1mecho "## Cleanup Summary" >> $GITHUB_STEP_SUMMARY[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5250973Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5251267Z [36;1mecho "- Days to keep: 7" >> $GITHUB_STEP_SUMMARY[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5251594Z [36;1mecho "- Dry run: false" >> $GITHUB_STEP_SUMMARY[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5251911Z [36;1mecho "- Changes: false" >> $GITHUB_STEP_SUMMARY[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5252226Z [36;1mecho "- Status: success" >> $GITHUB_STEP_SUMMARY[0m
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5283686Z shell: /usr/bin/bash -e {0}
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5283928Z ##[endgroup]
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.5421289Z Post job cleanup.
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6487177Z [command]/usr/bin/git version
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6526273Z git version 2.52.0
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6573004Z Temporarily overriding HOME='/home/runner/work/_temp/82375a79-504b-49ea-a09b-745facb2da46' before making global git config changes
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6574339Z Adding repository directory to the temporary git global config as a safe directory
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6580089Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6618023Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6658793Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6888612Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6909938Z http.https://github.com/.extraheader
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6922843Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.6953167Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.7180168Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.7220001Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
cleanup	UNKNOWN STEP	2026-02-08T04:30:53.7600673Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: WP16 Manual - Market Prices (Stooq)
```
latest_run_id=21802651686
failed to get run log: log not found
log_capture=failed -> auto_repro_attempt
```

### WORKFLOW: Refresh Health Assets
```
latest_run_id=21896163581
refresh	Set up job	﻿2026-02-11T07:19:29.2917826Z Current runner version: '2.331.0'
refresh	Set up job	2026-02-11T07:19:29.2942865Z ##[group]Runner Image Provisioner
refresh	Set up job	2026-02-11T07:19:29.2944088Z Hosted Compute Agent
refresh	Set up job	2026-02-11T07:19:29.2944810Z Version: 20260123.484
refresh	Set up job	2026-02-11T07:19:29.2945494Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
refresh	Set up job	2026-02-11T07:19:29.2946191Z Build Date: 2026-01-23T19:41:17Z
refresh	Set up job	2026-02-11T07:19:29.2946833Z Worker ID: {8d1a3606-a414-412f-9276-f5300c2cb23b}
refresh	Set up job	2026-02-11T07:19:29.2947655Z Azure Region: westcentralus
refresh	Set up job	2026-02-11T07:19:29.2948240Z ##[endgroup]
refresh	Set up job	2026-02-11T07:19:29.2949630Z ##[group]Operating System
refresh	Set up job	2026-02-11T07:19:29.2950321Z Ubuntu
refresh	Set up job	2026-02-11T07:19:29.2950775Z 24.04.3
refresh	Set up job	2026-02-11T07:19:29.2951280Z LTS
refresh	Set up job	2026-02-11T07:19:29.2951771Z ##[endgroup]
refresh	Set up job	2026-02-11T07:19:29.2952365Z ##[group]Runner Image
refresh	Set up job	2026-02-11T07:19:29.2952951Z Image: ubuntu-24.04
refresh	Set up job	2026-02-11T07:19:29.2953497Z Version: 20260201.15.1
refresh	Set up job	2026-02-11T07:19:29.2954868Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
refresh	Set up job	2026-02-11T07:19:29.2956606Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
refresh	Set up job	2026-02-11T07:19:29.2957470Z ##[endgroup]
refresh	Set up job	2026-02-11T07:19:29.2958418Z ##[group]GITHUB_TOKEN Permissions
refresh	Set up job	2026-02-11T07:19:29.2960254Z Contents: write
refresh	Set up job	2026-02-11T07:19:29.2960876Z Metadata: read
refresh	Set up job	2026-02-11T07:19:29.2961318Z ##[endgroup]
refresh	Set up job	2026-02-11T07:19:29.2964367Z Secret source: Actions
refresh	Set up job	2026-02-11T07:19:29.2965219Z Prepare workflow directory
refresh	Set up job	2026-02-11T07:19:29.3358378Z Prepare all required actions
refresh	Set up job	2026-02-11T07:19:29.3396990Z Getting action download info
refresh	Set up job	2026-02-11T07:19:29.7241069Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
refresh	Set up job	2026-02-11T07:19:29.8340737Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
refresh	Set up job	2026-02-11T07:19:30.0249341Z Complete job name: refresh
refresh	Checkout	﻿2026-02-11T07:19:30.0944631Z ##[group]Run actions/checkout@v4
refresh	Checkout	2026-02-11T07:19:30.0945497Z with:
refresh	Checkout	2026-02-11T07:19:30.0946103Z   token: ***
refresh	Checkout	2026-02-11T07:19:30.0946558Z   repository: RubikVault/rubikvault-site
refresh	Checkout	2026-02-11T07:19:30.0947070Z   ssh-strict: true
refresh	Checkout	2026-02-11T07:19:30.0947454Z   ssh-user: git
refresh	Checkout	2026-02-11T07:19:30.0947843Z   persist-credentials: true
refresh	Checkout	2026-02-11T07:19:30.0948280Z   clean: true
refresh	Checkout	2026-02-11T07:19:30.0948669Z   sparse-checkout-cone-mode: true
refresh	Checkout	2026-02-11T07:19:30.0949146Z   fetch-depth: 1
refresh	Checkout	2026-02-11T07:19:30.0949522Z   fetch-tags: false
refresh	Checkout	2026-02-11T07:19:30.0949914Z   show-progress: true
refresh	Checkout	2026-02-11T07:19:30.0950300Z   lfs: false
refresh	Checkout	2026-02-11T07:19:30.0950666Z   submodules: false
refresh	Checkout	2026-02-11T07:19:30.0951071Z   set-safe-directory: true
refresh	Checkout	2026-02-11T07:19:30.0951699Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:30.2052776Z Syncing repository: RubikVault/rubikvault-site
refresh	Checkout	2026-02-11T07:19:30.2055011Z ##[group]Getting Git version info
refresh	Checkout	2026-02-11T07:19:30.2055813Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
refresh	Checkout	2026-02-11T07:19:30.2056984Z [command]/usr/bin/git version
refresh	Checkout	2026-02-11T07:19:30.2147540Z git version 2.52.0
refresh	Checkout	2026-02-11T07:19:30.2174298Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:30.2190302Z Temporarily overriding HOME='/home/runner/work/_temp/834a7066-8f60-47ec-b186-75b477d8ac88' before making global git config changes
refresh	Checkout	2026-02-11T07:19:30.2192654Z Adding repository directory to the temporary git global config as a safe directory
refresh	Checkout	2026-02-11T07:19:30.2206022Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
refresh	Checkout	2026-02-11T07:19:30.2247721Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
refresh	Checkout	2026-02-11T07:19:30.2251508Z ##[group]Initializing the repository
refresh	Checkout	2026-02-11T07:19:30.2256727Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
refresh	Checkout	2026-02-11T07:19:30.2354666Z hint: Using 'master' as the name for the initial branch. This default branch name
refresh	Checkout	2026-02-11T07:19:30.2356056Z hint: will change to "main" in Git 3.0. To configure the initial branch name
refresh	Checkout	2026-02-11T07:19:30.2357041Z hint: to use in all of your new repositories, which will suppress this warning,
refresh	Checkout	2026-02-11T07:19:30.2358658Z hint: call:
refresh	Checkout	2026-02-11T07:19:30.2359088Z hint:
refresh	Checkout	2026-02-11T07:19:30.2359968Z hint: 	git config --global init.defaultBranch <name>
refresh	Checkout	2026-02-11T07:19:30.2361033Z hint:
refresh	Checkout	2026-02-11T07:19:30.2362123Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
refresh	Checkout	2026-02-11T07:19:30.2363937Z hint: 'development'. The just-created branch can be renamed via this command:
refresh	Checkout	2026-02-11T07:19:30.2365276Z hint:
refresh	Checkout	2026-02-11T07:19:30.2365980Z hint: 	git branch -m <name>
refresh	Checkout	2026-02-11T07:19:30.2366738Z hint:
refresh	Checkout	2026-02-11T07:19:30.2367716Z hint: Disable this message with "git config set advice.defaultBranchName false"
refresh	Checkout	2026-02-11T07:19:30.2369527Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
refresh	Checkout	2026-02-11T07:19:30.2372547Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
refresh	Checkout	2026-02-11T07:19:30.2405816Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:30.2406625Z ##[group]Disabling automatic garbage collection
refresh	Checkout	2026-02-11T07:19:30.2409918Z [command]/usr/bin/git config --local gc.auto 0
refresh	Checkout	2026-02-11T07:19:30.2438010Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:30.2438686Z ##[group]Setting up auth
refresh	Checkout	2026-02-11T07:19:30.2444892Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
refresh	Checkout	2026-02-11T07:19:30.2473667Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
refresh	Checkout	2026-02-11T07:19:30.2829205Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
refresh	Checkout	2026-02-11T07:19:30.2860649Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
refresh	Checkout	2026-02-11T07:19:30.3084838Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
refresh	Checkout	2026-02-11T07:19:30.3116614Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
refresh	Checkout	2026-02-11T07:19:30.3365808Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
refresh	Checkout	2026-02-11T07:19:30.3407815Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:30.3409149Z ##[group]Fetching the repository
refresh	Checkout	2026-02-11T07:19:30.3417133Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f:refs/remotes/origin/main
refresh	Checkout	2026-02-11T07:19:31.3921667Z From https://github.com/RubikVault/rubikvault-site
refresh	Checkout	2026-02-11T07:19:31.3924979Z  * [new ref]         eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f -> origin/main
refresh	Checkout	2026-02-11T07:19:31.3955639Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:31.3957562Z ##[group]Determining the checkout info
refresh	Checkout	2026-02-11T07:19:31.3959654Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:31.3963644Z [command]/usr/bin/git sparse-checkout disable
refresh	Checkout	2026-02-11T07:19:31.4005736Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
refresh	Checkout	2026-02-11T07:19:31.4032719Z ##[group]Checking out the ref
refresh	Checkout	2026-02-11T07:19:31.4037154Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
refresh	Checkout	2026-02-11T07:19:31.5169237Z Switched to a new branch 'main'
refresh	Checkout	2026-02-11T07:19:31.5170905Z branch 'main' set up to track 'origin/main'.
refresh	Checkout	2026-02-11T07:19:31.5186955Z ##[endgroup]
refresh	Checkout	2026-02-11T07:19:31.5223567Z [command]/usr/bin/git log -1 --format=%H
refresh	Checkout	2026-02-11T07:19:31.5245724Z eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f
refresh	Setup Node	﻿2026-02-11T07:19:31.5561693Z ##[group]Run actions/setup-node@v4
refresh	Setup Node	2026-02-11T07:19:31.5562900Z with:
refresh	Setup Node	2026-02-11T07:19:31.5563678Z   node-version: 20
refresh	Setup Node	2026-02-11T07:19:31.5564888Z   always-auth: false
refresh	Setup Node	2026-02-11T07:19:31.5565829Z   check-latest: false
refresh	Setup Node	2026-02-11T07:19:31.5567014Z   token: ***
refresh	Setup Node	2026-02-11T07:19:31.5567826Z ##[endgroup]
refresh	Setup Node	2026-02-11T07:19:31.7428242Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
refresh	Setup Node	2026-02-11T07:19:31.7435013Z ##[group]Environment details
refresh	Setup Node	2026-02-11T07:19:32.0978673Z node: v20.20.0
refresh	Setup Node	2026-02-11T07:19:32.0979513Z npm: 10.8.2
refresh	Setup Node	2026-02-11T07:19:32.0979865Z yarn: 1.22.22
refresh	Setup Node	2026-02-11T07:19:32.0981233Z ##[endgroup]
refresh	Install dependencies	﻿2026-02-11T07:19:32.1084867Z ##[group]Run npm ci
refresh	Install dependencies	2026-02-11T07:19:32.1085246Z [36;1mnpm ci[0m
refresh	Install dependencies	2026-02-11T07:19:32.1128887Z shell: /usr/bin/bash -e {0}
refresh	Install dependencies	2026-02-11T07:19:32.1129249Z ##[endgroup]
refresh	Install dependencies	2026-02-11T07:19:33.8190860Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
refresh	Install dependencies	2026-02-11T07:19:33.8547199Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
refresh	Install dependencies	2026-02-11T07:19:35.4438301Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
refresh	Install dependencies	2026-02-11T07:19:38.7304703Z 
refresh	Install dependencies	2026-02-11T07:19:38.7305690Z added 106 packages, and audited 107 packages in 7s
refresh	Install dependencies	2026-02-11T07:19:38.7306389Z 
refresh	Install dependencies	2026-02-11T07:19:38.7306674Z 18 packages are looking for funding
refresh	Install dependencies	2026-02-11T07:19:38.7307174Z   run `npm fund` for details
refresh	Install dependencies	2026-02-11T07:19:38.7966829Z 
refresh	Install dependencies	2026-02-11T07:19:38.7969429Z 6 vulnerabilities (2 moderate, 4 high)
refresh	Install dependencies	2026-02-11T07:19:38.7969903Z 
refresh	Install dependencies	2026-02-11T07:19:38.7970384Z To address all issues (including breaking changes), run:
refresh	Install dependencies	2026-02-11T07:19:38.7972094Z   npm audit fix --force
refresh	Install dependencies	2026-02-11T07:19:38.7972452Z 
refresh	Install dependencies	2026-02-11T07:19:38.7972706Z Run `npm audit` for details.
refresh	Refresh health assets	﻿2026-02-11T07:19:38.8215937Z ##[group]Run node scripts/refresh-health-assets.mjs
refresh	Refresh health assets	2026-02-11T07:19:38.8216416Z [36;1mnode scripts/refresh-health-assets.mjs[0m
refresh	Refresh health assets	2026-02-11T07:19:38.8257027Z shell: /usr/bin/bash -e {0}
refresh	Refresh health assets	2026-02-11T07:19:38.8257520Z ##[endgroup]
refresh	Refresh health assets	2026-02-11T07:19:38.9032837Z Error: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/seed-manifest.json'
refresh	Refresh health assets	2026-02-11T07:19:38.9035957Z     at async open (node:internal/fs/promises:634:25)
refresh	Refresh health assets	2026-02-11T07:19:38.9036806Z     at async Object.readFile (node:internal/fs/promises:1236:14)
refresh	Refresh health assets	2026-02-11T07:19:38.9038033Z     at async readJson (file:///home/runner/work/rubikvault-site/rubikvault-site/scripts/refresh-health-assets.mjs:12:15)
refresh	Refresh health assets	2026-02-11T07:19:38.9039539Z     at async main (file:///home/runner/work/rubikvault-site/rubikvault-site/scripts/refresh-health-assets.mjs:163:24)
refresh	Refresh health assets	2026-02-11T07:19:38.9091774Z ##[error]Process completed with exit code 1.
refresh	Post Checkout	﻿2026-02-11T07:19:38.9322220Z Post job cleanup.
refresh	Post Checkout	2026-02-11T07:19:39.0267054Z [command]/usr/bin/git version
refresh	Post Checkout	2026-02-11T07:19:39.0307580Z git version 2.52.0
refresh	Post Checkout	2026-02-11T07:19:39.0354349Z Temporarily overriding HOME='/home/runner/work/_temp/b6e84145-8cd3-45e7-8338-bfdf43238d47' before making global git config changes
refresh	Post Checkout	2026-02-11T07:19:39.0355944Z Adding repository directory to the temporary git global config as a safe directory
refresh	Post Checkout	2026-02-11T07:19:39.0360227Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
refresh	Post Checkout	2026-02-11T07:19:39.0399745Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
refresh	Post Checkout	2026-02-11T07:19:39.0434690Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
refresh	Post Checkout	2026-02-11T07:19:39.0679004Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
refresh	Post Checkout	2026-02-11T07:19:39.0702183Z http.https://github.com/.extraheader
refresh	Post Checkout	2026-02-11T07:19:39.0717275Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
refresh	Post Checkout	2026-02-11T07:19:39.0749972Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
refresh	Post Checkout	2026-02-11T07:19:39.0989871Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
refresh	Post Checkout	2026-02-11T07:19:39.1022501Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
refresh	Complete job	﻿2026-02-11T07:19:39.1383912Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Ops Daily Snapshot
```
latest_run_id=21897104927
run	UNKNOWN STEP	﻿2026-02-11T07:59:40.4852475Z Current runner version: '2.331.0'
run	UNKNOWN STEP	2026-02-11T07:59:40.4884662Z ##[group]Runner Image Provisioner
run	UNKNOWN STEP	2026-02-11T07:59:40.4885807Z Hosted Compute Agent
run	UNKNOWN STEP	2026-02-11T07:59:40.4887057Z Version: 20260123.484
run	UNKNOWN STEP	2026-02-11T07:59:40.4888149Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
run	UNKNOWN STEP	2026-02-11T07:59:40.4889241Z Build Date: 2026-01-23T19:41:17Z
run	UNKNOWN STEP	2026-02-11T07:59:40.4890368Z Worker ID: {0639a1c2-c87b-470a-95b3-ffe3d640b0fe}
run	UNKNOWN STEP	2026-02-11T07:59:40.4891514Z Azure Region: eastus
run	UNKNOWN STEP	2026-02-11T07:59:40.4892285Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:40.4895025Z ##[group]Operating System
run	UNKNOWN STEP	2026-02-11T07:59:40.4895891Z Ubuntu
run	UNKNOWN STEP	2026-02-11T07:59:40.4896833Z 24.04.3
run	UNKNOWN STEP	2026-02-11T07:59:40.4897682Z LTS
run	UNKNOWN STEP	2026-02-11T07:59:40.4898368Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:40.4899184Z ##[group]Runner Image
run	UNKNOWN STEP	2026-02-11T07:59:40.4900053Z Image: ubuntu-24.04
run	UNKNOWN STEP	2026-02-11T07:59:40.4900942Z Version: 20260201.15.1
run	UNKNOWN STEP	2026-02-11T07:59:40.4902862Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
run	UNKNOWN STEP	2026-02-11T07:59:40.4905310Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
run	UNKNOWN STEP	2026-02-11T07:59:40.4907231Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:40.4908791Z ##[group]GITHUB_TOKEN Permissions
run	UNKNOWN STEP	2026-02-11T07:59:40.4911194Z Contents: write
run	UNKNOWN STEP	2026-02-11T07:59:40.4912194Z Metadata: read
run	UNKNOWN STEP	2026-02-11T07:59:40.4912951Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:40.4915703Z Secret source: Actions
run	UNKNOWN STEP	2026-02-11T07:59:40.4917157Z Prepare workflow directory
run	UNKNOWN STEP	2026-02-11T07:59:40.5377775Z Prepare all required actions
run	UNKNOWN STEP	2026-02-11T07:59:40.5434231Z Getting action download info
run	UNKNOWN STEP	2026-02-11T07:59:40.8234612Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
run	UNKNOWN STEP	2026-02-11T07:59:40.9373464Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
run	UNKNOWN STEP	2026-02-11T07:59:41.1265105Z Complete job name: run
run	UNKNOWN STEP	2026-02-11T07:59:41.1961449Z ##[group]Run actions/checkout@v4
run	UNKNOWN STEP	2026-02-11T07:59:41.1962252Z with:
run	UNKNOWN STEP	2026-02-11T07:59:41.1962818Z   token: ***
run	UNKNOWN STEP	2026-02-11T07:59:41.1963268Z   repository: RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:41.1963797Z   ssh-strict: true
run	UNKNOWN STEP	2026-02-11T07:59:41.1964186Z   ssh-user: git
run	UNKNOWN STEP	2026-02-11T07:59:41.1964587Z   persist-credentials: true
run	UNKNOWN STEP	2026-02-11T07:59:41.1965030Z   clean: true
run	UNKNOWN STEP	2026-02-11T07:59:41.1965432Z   sparse-checkout-cone-mode: true
run	UNKNOWN STEP	2026-02-11T07:59:41.1965911Z   fetch-depth: 1
run	UNKNOWN STEP	2026-02-11T07:59:41.1966509Z   fetch-tags: false
run	UNKNOWN STEP	2026-02-11T07:59:41.1966927Z   show-progress: true
run	UNKNOWN STEP	2026-02-11T07:59:41.1967333Z   lfs: false
run	UNKNOWN STEP	2026-02-11T07:59:41.1967689Z   submodules: false
run	UNKNOWN STEP	2026-02-11T07:59:41.1968087Z   set-safe-directory: true
run	UNKNOWN STEP	2026-02-11T07:59:41.1968746Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.3016341Z Syncing repository: RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:41.3018125Z ##[group]Getting Git version info
run	UNKNOWN STEP	2026-02-11T07:59:41.3018941Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
run	UNKNOWN STEP	2026-02-11T07:59:41.3019943Z [command]/usr/bin/git version
run	UNKNOWN STEP	2026-02-11T07:59:41.3135010Z git version 2.52.0
run	UNKNOWN STEP	2026-02-11T07:59:41.3160550Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.3174390Z Temporarily overriding HOME='/home/runner/work/_temp/89c8f95c-fbd7-481f-8a07-e714eed2285d' before making global git config changes
run	UNKNOWN STEP	2026-02-11T07:59:41.3175775Z Adding repository directory to the temporary git global config as a safe directory
run	UNKNOWN STEP	2026-02-11T07:59:41.3187165Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:41.3225026Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
run	UNKNOWN STEP	2026-02-11T07:59:41.3228766Z ##[group]Initializing the repository
run	UNKNOWN STEP	2026-02-11T07:59:41.3232638Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:41.3369418Z hint: Using 'master' as the name for the initial branch. This default branch name
run	UNKNOWN STEP	2026-02-11T07:59:41.3370537Z hint: will change to "main" in Git 3.0. To configure the initial branch name
run	UNKNOWN STEP	2026-02-11T07:59:41.3371442Z hint: to use in all of your new repositories, which will suppress this warning,
run	UNKNOWN STEP	2026-02-11T07:59:41.3372610Z hint: call:
run	UNKNOWN STEP	2026-02-11T07:59:41.3373269Z hint:
run	UNKNOWN STEP	2026-02-11T07:59:41.3374101Z hint: 	git config --global init.defaultBranch <name>
run	UNKNOWN STEP	2026-02-11T07:59:41.3375051Z hint:
run	UNKNOWN STEP	2026-02-11T07:59:41.3376078Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
run	UNKNOWN STEP	2026-02-11T07:59:41.3377929Z hint: 'development'. The just-created branch can be renamed via this command:
run	UNKNOWN STEP	2026-02-11T07:59:41.3379202Z hint:
run	UNKNOWN STEP	2026-02-11T07:59:41.3379883Z hint: 	git branch -m <name>
run	UNKNOWN STEP	2026-02-11T07:59:41.3380695Z hint:
run	UNKNOWN STEP	2026-02-11T07:59:41.3381753Z hint: Disable this message with "git config set advice.defaultBranchName false"
run	UNKNOWN STEP	2026-02-11T07:59:41.3383564Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
run	UNKNOWN STEP	2026-02-11T07:59:41.3388341Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:41.3422911Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.3424112Z ##[group]Disabling automatic garbage collection
run	UNKNOWN STEP	2026-02-11T07:59:41.3428153Z [command]/usr/bin/git config --local gc.auto 0
run	UNKNOWN STEP	2026-02-11T07:59:41.3456050Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.3457053Z ##[group]Setting up auth
run	UNKNOWN STEP	2026-02-11T07:59:41.3462641Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
run	UNKNOWN STEP	2026-02-11T07:59:41.3492431Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
run	UNKNOWN STEP	2026-02-11T07:59:41.3858642Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
run	UNKNOWN STEP	2026-02-11T07:59:41.3891268Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
run	UNKNOWN STEP	2026-02-11T07:59:41.4113088Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
run	UNKNOWN STEP	2026-02-11T07:59:41.4143854Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
run	UNKNOWN STEP	2026-02-11T07:59:41.4370289Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
run	UNKNOWN STEP	2026-02-11T07:59:41.4403664Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.4404713Z ##[group]Fetching the repository
run	UNKNOWN STEP	2026-02-11T07:59:41.4412256Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f:refs/remotes/origin/main
run	UNKNOWN STEP	2026-02-11T07:59:41.9112751Z From https://github.com/RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:41.9114672Z  * [new ref]         eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f -> origin/main
run	UNKNOWN STEP	2026-02-11T07:59:41.9152675Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.9153967Z ##[group]Determining the checkout info
run	UNKNOWN STEP	2026-02-11T07:59:41.9155393Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:41.9158524Z [command]/usr/bin/git sparse-checkout disable
run	UNKNOWN STEP	2026-02-11T07:59:41.9204749Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
run	UNKNOWN STEP	2026-02-11T07:59:41.9232757Z ##[group]Checking out the ref
run	UNKNOWN STEP	2026-02-11T07:59:41.9236539Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
run	UNKNOWN STEP	2026-02-11T07:59:42.0405945Z Switched to a new branch 'main'
run	UNKNOWN STEP	2026-02-11T07:59:42.0407711Z branch 'main' set up to track 'origin/main'.
run	UNKNOWN STEP	2026-02-11T07:59:42.0458537Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:42.0461883Z [command]/usr/bin/git log -1 --format=%H
run	UNKNOWN STEP	2026-02-11T07:59:42.0483932Z eb10ea2b81f5fb4cea194e7ec424c21ffc56bd9f
run	UNKNOWN STEP	2026-02-11T07:59:42.0782567Z ##[group]Run actions/setup-node@v4
run	UNKNOWN STEP	2026-02-11T07:59:42.0783695Z with:
run	UNKNOWN STEP	2026-02-11T07:59:42.0784483Z   node-version: 20
run	UNKNOWN STEP	2026-02-11T07:59:42.0785364Z   always-auth: false
run	UNKNOWN STEP	2026-02-11T07:59:42.0786412Z   check-latest: false
run	UNKNOWN STEP	2026-02-11T07:59:42.0787608Z   token: ***
run	UNKNOWN STEP	2026-02-11T07:59:42.0788419Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:42.2593179Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
run	UNKNOWN STEP	2026-02-11T07:59:42.2597485Z ##[group]Environment details
run	UNKNOWN STEP	2026-02-11T07:59:42.6175196Z node: v20.20.0
run	UNKNOWN STEP	2026-02-11T07:59:42.6176507Z npm: 10.8.2
run	UNKNOWN STEP	2026-02-11T07:59:42.6176959Z yarn: 1.22.22
run	UNKNOWN STEP	2026-02-11T07:59:42.6177987Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:42.6289758Z ##[group]Run npm ci
run	UNKNOWN STEP	2026-02-11T07:59:42.6290099Z [36;1mnpm ci[0m
run	UNKNOWN STEP	2026-02-11T07:59:42.6340000Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:42.6340346Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:44.2545949Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
run	UNKNOWN STEP	2026-02-11T07:59:44.2789447Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
run	UNKNOWN STEP	2026-02-11T07:59:45.7878943Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
run	UNKNOWN STEP	2026-02-11T07:59:48.7790510Z 
run	UNKNOWN STEP	2026-02-11T07:59:48.7791925Z added 106 packages, and audited 107 packages in 6s
run	UNKNOWN STEP	2026-02-11T07:59:48.7792557Z 
run	UNKNOWN STEP	2026-02-11T07:59:48.7792896Z 18 packages are looking for funding
run	UNKNOWN STEP	2026-02-11T07:59:48.7793519Z   run `npm fund` for details
run	UNKNOWN STEP	2026-02-11T07:59:48.8416424Z 
run	UNKNOWN STEP	2026-02-11T07:59:48.8417680Z 6 vulnerabilities (2 moderate, 4 high)
run	UNKNOWN STEP	2026-02-11T07:59:48.8418272Z 
run	UNKNOWN STEP	2026-02-11T07:59:48.8418808Z To address all issues (including breaking changes), run:
run	UNKNOWN STEP	2026-02-11T07:59:48.8419417Z   npm audit fix --force
run	UNKNOWN STEP	2026-02-11T07:59:48.8419634Z 
run	UNKNOWN STEP	2026-02-11T07:59:48.8419811Z Run `npm audit` for details.
run	UNKNOWN STEP	2026-02-11T07:59:48.8672372Z ##[group]Run node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100
run	UNKNOWN STEP	2026-02-11T07:59:48.8673051Z [36;1mnode scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100[0m
run	UNKNOWN STEP	2026-02-11T07:59:48.8706828Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:48.8707077Z env:
run	UNKNOWN STEP	2026-02-11T07:59:48.8707415Z   CF_ACCOUNT_ID: ***
run	UNKNOWN STEP	2026-02-11T07:59:48.8707626Z   CF_API_TOKEN: 
run	UNKNOWN STEP	2026-02-11T07:59:48.8707814Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:48.9073577Z (node:2321) V8: file:///home/runner/work/rubikvault-site/rubikvault-site/functions/api/_shared/eod-providers.mjs:6 'assert' is deprecated in import statements and support will be removed in a future version; use 'with' instead
run	UNKNOWN STEP	2026-02-11T07:59:48.9075219Z (Use `node --trace-warnings ...` to show where the warning was created)
run	UNKNOWN STEP	2026-02-11T07:59:48.9116734Z KV backend unavailable (CF_ACCOUNT_ID/CF_API_TOKEN/CF_KV_NAMESPACE_ID missing). Provider fallback disabled.
run	UNKNOWN STEP	2026-02-11T07:59:48.9204625Z Mirror written: public/data/pipeline/missing.json
run	UNKNOWN STEP	2026-02-11T07:59:48.9205298Z MarketPhase generated: 0/100
run	UNKNOWN STEP	2026-02-11T07:59:48.9205727Z Missing: 100
run	UNKNOWN STEP	2026-02-11T07:59:48.9331726Z ##[group]Run node scripts/pipeline/build-ndx100-pipeline-truth.mjs
run	UNKNOWN STEP	2026-02-11T07:59:48.9332244Z [36;1mnode scripts/pipeline/build-ndx100-pipeline-truth.mjs[0m
run	UNKNOWN STEP	2026-02-11T07:59:48.9365479Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:48.9365722Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:49.0154601Z ✓ Written: public/data/pipeline/nasdaq100.pipeline-truth.json
run	UNKNOWN STEP	2026-02-11T07:59:49.0159197Z   counts: expected=517, fetched=517, validated=517, computed=0, static_ready=0
run	UNKNOWN STEP	2026-02-11T07:59:49.0160039Z   first_blocker: S3 (FAIL)
run	UNKNOWN STEP	2026-02-11T07:59:49.0230326Z ##[group]Run node scripts/ops/build-safety-snapshot.mjs
run	UNKNOWN STEP	2026-02-11T07:59:49.0230822Z [36;1mnode scripts/ops/build-safety-snapshot.mjs[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.0265661Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:49.0265909Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:49.0599697Z OK: safety snapshot generated (activeLocks=0)
run	UNKNOWN STEP	2026-02-11T07:59:49.0662279Z ##[group]Run node scripts/ops/build-ops-daily.mjs
run	UNKNOWN STEP	2026-02-11T07:59:49.0662678Z [36;1mnode scripts/ops/build-ops-daily.mjs[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.0698912Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:49.0699159Z env:
run	UNKNOWN STEP	2026-02-11T07:59:49.0699481Z   CF_ACCOUNT_ID: ***
run	UNKNOWN STEP	2026-02-11T07:59:49.0699684Z   CF_API_TOKEN: 
run	UNKNOWN STEP	2026-02-11T07:59:49.0699872Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:49.1244400Z ##[group]Run node scripts/ops/build-mission-control-summary.mjs
run	UNKNOWN STEP	2026-02-11T07:59:49.1244877Z [36;1mnode scripts/ops/build-mission-control-summary.mjs[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.1281538Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:49.1281792Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:49.1627024Z OK: ops summary generated (status=WARN)
run	UNKNOWN STEP	2026-02-11T07:59:49.1686996Z ##[group]Run node scripts/ops/validate-ops-summary.mjs
run	UNKNOWN STEP	2026-02-11T07:59:49.1687441Z [36;1mnode scripts/ops/validate-ops-summary.mjs[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.1723338Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:49.1723593Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:49.2044617Z OK: ops summary matches pipeline.latest
run	UNKNOWN STEP	2026-02-11T07:59:49.2103487Z ##[group]Run set -euo pipefail
run	UNKNOWN STEP	2026-02-11T07:59:49.2103812Z [36;1mset -euo pipefail[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2104074Z [36;1mgit config user.name "RubikVault Bot"[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2104393Z [36;1mgit config user.email "bot@rubikvault.com"[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2104836Z [36;1mgit add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2105288Z [36;1mif git diff --cached --quiet; then[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2105582Z [36;1m  echo "No staged changes"[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2105811Z [36;1m  exit 0[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2106019Z [36;1mfi[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2106832Z [36;1mgit commit -m "chore(ops): update ops-daily snapshot" || exit 0[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2107189Z [36;1m[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2107371Z [36;1mfor i in 1 2 3; do[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2107619Z [36;1m  if git push origin HEAD:main; then[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2107884Z [36;1m    exit 0[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2108074Z [36;1m  fi[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2108354Z [36;1m  echo "push failed (attempt $i); retrying in 5s" >&2[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2108668Z [36;1m  sleep 5[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2108899Z [36;1m  git pull --rebase origin main || true[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2109164Z [36;1mdone[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2109363Z [36;1mecho "push failed after retries" >&2[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2109619Z [36;1mexit 1[0m
run	UNKNOWN STEP	2026-02-11T07:59:49.2146041Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-11T07:59:49.2146474Z ##[endgroup]
run	UNKNOWN STEP	2026-02-11T07:59:49.2749488Z [main ed17aaf] chore(ops): update ops-daily snapshot
run	UNKNOWN STEP	2026-02-11T07:59:49.2750161Z  9 files changed, 29 insertions(+), 24 deletions(-)
run	UNKNOWN STEP	2026-02-11T07:59:49.7785054Z To https://github.com/RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:49.7785892Z    eb10ea2..ed17aaf  HEAD -> main
run	UNKNOWN STEP	2026-02-11T07:59:49.7897036Z Post job cleanup.
run	UNKNOWN STEP	2026-02-11T07:59:49.9563845Z Post job cleanup.
run	UNKNOWN STEP	2026-02-11T07:59:50.0503678Z [command]/usr/bin/git version
run	UNKNOWN STEP	2026-02-11T07:59:50.0539931Z git version 2.52.0
run	UNKNOWN STEP	2026-02-11T07:59:50.0582284Z Temporarily overriding HOME='/home/runner/work/_temp/9fa6929f-b54b-4138-9bb4-ae9c225e1da8' before making global git config changes
run	UNKNOWN STEP	2026-02-11T07:59:50.0583250Z Adding repository directory to the temporary git global config as a safe directory
run	UNKNOWN STEP	2026-02-11T07:59:50.0588007Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
run	UNKNOWN STEP	2026-02-11T07:59:50.0625083Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
run	UNKNOWN STEP	2026-02-11T07:59:50.0659947Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
run	UNKNOWN STEP	2026-02-11T07:59:50.0894468Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
run	UNKNOWN STEP	2026-02-11T07:59:50.0919086Z http.https://github.com/.extraheader
run	UNKNOWN STEP	2026-02-11T07:59:50.0933275Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
run	UNKNOWN STEP	2026-02-11T07:59:50.0968154Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
run	UNKNOWN STEP	2026-02-11T07:59:50.1200011Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
run	UNKNOWN STEP	2026-02-11T07:59:50.1233225Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
run	UNKNOWN STEP	2026-02-11T07:59:50.1567543Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: EOD Latest (NASDAQ-100)
```
latest_run_id=21885653618
run	UNKNOWN STEP	﻿2026-02-10T22:57:44.9717859Z Current runner version: '2.331.0'
run	UNKNOWN STEP	2026-02-10T22:57:44.9741995Z ##[group]Runner Image Provisioner
run	UNKNOWN STEP	2026-02-10T22:57:44.9742910Z Hosted Compute Agent
run	UNKNOWN STEP	2026-02-10T22:57:44.9743501Z Version: 20260123.484
run	UNKNOWN STEP	2026-02-10T22:57:44.9744070Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
run	UNKNOWN STEP	2026-02-10T22:57:44.9744806Z Build Date: 2026-01-23T19:41:17Z
run	UNKNOWN STEP	2026-02-10T22:57:44.9745647Z Worker ID: {bd6aa925-8cde-409d-9cf8-4b8c33a67d22}
run	UNKNOWN STEP	2026-02-10T22:57:44.9746337Z Azure Region: eastus2
run	UNKNOWN STEP	2026-02-10T22:57:44.9746967Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:44.9748457Z ##[group]Operating System
run	UNKNOWN STEP	2026-02-10T22:57:44.9749011Z Ubuntu
run	UNKNOWN STEP	2026-02-10T22:57:44.9749557Z 24.04.3
run	UNKNOWN STEP	2026-02-10T22:57:44.9749980Z LTS
run	UNKNOWN STEP	2026-02-10T22:57:44.9750470Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:44.9751014Z ##[group]Runner Image
run	UNKNOWN STEP	2026-02-10T22:57:44.9751520Z Image: ubuntu-24.04
run	UNKNOWN STEP	2026-02-10T22:57:44.9752016Z Version: 20260201.15.1
run	UNKNOWN STEP	2026-02-10T22:57:44.9753186Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
run	UNKNOWN STEP	2026-02-10T22:57:44.9754630Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
run	UNKNOWN STEP	2026-02-10T22:57:44.9755981Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:44.9757020Z ##[group]GITHUB_TOKEN Permissions
run	UNKNOWN STEP	2026-02-10T22:57:44.9759448Z Contents: write
run	UNKNOWN STEP	2026-02-10T22:57:44.9760003Z Metadata: read
run	UNKNOWN STEP	2026-02-10T22:57:44.9760463Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:44.9762609Z Secret source: Actions
run	UNKNOWN STEP	2026-02-10T22:57:44.9763318Z Prepare workflow directory
run	UNKNOWN STEP	2026-02-10T22:57:45.0491156Z Prepare all required actions
run	UNKNOWN STEP	2026-02-10T22:57:45.0547214Z Getting action download info
run	UNKNOWN STEP	2026-02-10T22:57:45.4142964Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
run	UNKNOWN STEP	2026-02-10T22:57:45.5240453Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
run	UNKNOWN STEP	2026-02-10T22:57:45.7183846Z Complete job name: run
run	UNKNOWN STEP	2026-02-10T22:57:45.7844552Z ##[group]Run actions/checkout@v4
run	UNKNOWN STEP	2026-02-10T22:57:45.7845690Z with:
run	UNKNOWN STEP	2026-02-10T22:57:45.7846375Z   token: ***
run	UNKNOWN STEP	2026-02-10T22:57:45.7846899Z   repository: RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:45.7847529Z   ssh-strict: true
run	UNKNOWN STEP	2026-02-10T22:57:45.7847952Z   ssh-user: git
run	UNKNOWN STEP	2026-02-10T22:57:45.7848379Z   persist-credentials: true
run	UNKNOWN STEP	2026-02-10T22:57:45.7848854Z   clean: true
run	UNKNOWN STEP	2026-02-10T22:57:45.7849271Z   sparse-checkout-cone-mode: true
run	UNKNOWN STEP	2026-02-10T22:57:45.7849783Z   fetch-depth: 1
run	UNKNOWN STEP	2026-02-10T22:57:45.7850215Z   fetch-tags: false
run	UNKNOWN STEP	2026-02-10T22:57:45.7850643Z   show-progress: true
run	UNKNOWN STEP	2026-02-10T22:57:45.7851081Z   lfs: false
run	UNKNOWN STEP	2026-02-10T22:57:45.7851465Z   submodules: false
run	UNKNOWN STEP	2026-02-10T22:57:45.7851904Z   set-safe-directory: true
run	UNKNOWN STEP	2026-02-10T22:57:45.7852601Z env:
run	UNKNOWN STEP	2026-02-10T22:57:45.7852999Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:45.7853453Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:45.8916803Z Syncing repository: RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:45.8918965Z ##[group]Getting Git version info
run	UNKNOWN STEP	2026-02-10T22:57:45.8919787Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
run	UNKNOWN STEP	2026-02-10T22:57:45.8920873Z [command]/usr/bin/git version
run	UNKNOWN STEP	2026-02-10T22:57:45.8999239Z git version 2.52.0
run	UNKNOWN STEP	2026-02-10T22:57:45.9024882Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:45.9039147Z Temporarily overriding HOME='/home/runner/work/_temp/bbf43415-43dd-4139-a939-30533d519d98' before making global git config changes
run	UNKNOWN STEP	2026-02-10T22:57:45.9040594Z Adding repository directory to the temporary git global config as a safe directory
run	UNKNOWN STEP	2026-02-10T22:57:45.9051699Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:45.9090488Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
run	UNKNOWN STEP	2026-02-10T22:57:45.9093741Z ##[group]Initializing the repository
run	UNKNOWN STEP	2026-02-10T22:57:45.9098212Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:45.9212488Z hint: Using 'master' as the name for the initial branch. This default branch name
run	UNKNOWN STEP	2026-02-10T22:57:45.9214101Z hint: will change to "main" in Git 3.0. To configure the initial branch name
run	UNKNOWN STEP	2026-02-10T22:57:45.9216405Z hint: to use in all of your new repositories, which will suppress this warning,
run	UNKNOWN STEP	2026-02-10T22:57:45.9217560Z hint: call:
run	UNKNOWN STEP	2026-02-10T22:57:45.9218390Z hint:
run	UNKNOWN STEP	2026-02-10T22:57:45.9219481Z hint: 	git config --global init.defaultBranch <name>
run	UNKNOWN STEP	2026-02-10T22:57:45.9220797Z hint:
run	UNKNOWN STEP	2026-02-10T22:57:45.9222041Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
run	UNKNOWN STEP	2026-02-10T22:57:45.9224126Z hint: 'development'. The just-created branch can be renamed via this command:
run	UNKNOWN STEP	2026-02-10T22:57:45.9226178Z hint:
run	UNKNOWN STEP	2026-02-10T22:57:45.9227024Z hint: 	git branch -m <name>
run	UNKNOWN STEP	2026-02-10T22:57:45.9227990Z hint:
run	UNKNOWN STEP	2026-02-10T22:57:45.9229200Z hint: Disable this message with "git config set advice.defaultBranchName false"
run	UNKNOWN STEP	2026-02-10T22:57:45.9231406Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
run	UNKNOWN STEP	2026-02-10T22:57:45.9234534Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:45.9266910Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:45.9268307Z ##[group]Disabling automatic garbage collection
run	UNKNOWN STEP	2026-02-10T22:57:45.9271641Z [command]/usr/bin/git config --local gc.auto 0
run	UNKNOWN STEP	2026-02-10T22:57:45.9300144Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:45.9300916Z ##[group]Setting up auth
run	UNKNOWN STEP	2026-02-10T22:57:45.9306591Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
run	UNKNOWN STEP	2026-02-10T22:57:45.9335879Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
run	UNKNOWN STEP	2026-02-10T22:57:45.9720454Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
run	UNKNOWN STEP	2026-02-10T22:57:45.9754322Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
run	UNKNOWN STEP	2026-02-10T22:57:45.9998775Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
run	UNKNOWN STEP	2026-02-10T22:57:46.0029521Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
run	UNKNOWN STEP	2026-02-10T22:57:46.0296020Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
run	UNKNOWN STEP	2026-02-10T22:57:46.0331038Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:46.0332446Z ##[group]Fetching the repository
run	UNKNOWN STEP	2026-02-10T22:57:46.0340780Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2:refs/remotes/origin/main
run	UNKNOWN STEP	2026-02-10T22:57:46.6006957Z From https://github.com/RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:46.6008472Z  * [new ref]         2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2 -> origin/main
run	UNKNOWN STEP	2026-02-10T22:57:46.6040800Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:46.6042251Z ##[group]Determining the checkout info
run	UNKNOWN STEP	2026-02-10T22:57:46.6043775Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:46.6047970Z [command]/usr/bin/git sparse-checkout disable
run	UNKNOWN STEP	2026-02-10T22:57:46.6091199Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
run	UNKNOWN STEP	2026-02-10T22:57:46.6119777Z ##[group]Checking out the ref
run	UNKNOWN STEP	2026-02-10T22:57:46.6124071Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
run	UNKNOWN STEP	2026-02-10T22:57:46.7270028Z Switched to a new branch 'main'
run	UNKNOWN STEP	2026-02-10T22:57:46.7271855Z branch 'main' set up to track 'origin/main'.
run	UNKNOWN STEP	2026-02-10T22:57:46.7288538Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:46.7328127Z [command]/usr/bin/git log -1 --format=%H
run	UNKNOWN STEP	2026-02-10T22:57:46.7351154Z 2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2
run	UNKNOWN STEP	2026-02-10T22:57:46.7659535Z ##[group]Run actions/setup-node@v4
run	UNKNOWN STEP	2026-02-10T22:57:46.7660817Z with:
run	UNKNOWN STEP	2026-02-10T22:57:46.7661650Z   node-version: 20
run	UNKNOWN STEP	2026-02-10T22:57:46.7662567Z   always-auth: false
run	UNKNOWN STEP	2026-02-10T22:57:46.7663506Z   check-latest: false
run	UNKNOWN STEP	2026-02-10T22:57:46.7664736Z   token: ***
run	UNKNOWN STEP	2026-02-10T22:57:46.7665706Z env:
run	UNKNOWN STEP	2026-02-10T22:57:46.7666519Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:46.7667498Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:46.9455197Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
run	UNKNOWN STEP	2026-02-10T22:57:46.9460974Z ##[group]Environment details
run	UNKNOWN STEP	2026-02-10T22:57:47.3162037Z node: v20.20.0
run	UNKNOWN STEP	2026-02-10T22:57:47.3163521Z npm: 10.8.2
run	UNKNOWN STEP	2026-02-10T22:57:47.3164760Z yarn: 1.22.22
run	UNKNOWN STEP	2026-02-10T22:57:47.3167300Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:47.3312490Z ##[group]Run npm ci
run	UNKNOWN STEP	2026-02-10T22:57:47.3313398Z [36;1mnpm ci[0m
run	UNKNOWN STEP	2026-02-10T22:57:47.3359533Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:47.3360494Z env:
run	UNKNOWN STEP	2026-02-10T22:57:47.3361216Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:47.3362102Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:48.9383538Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
run	UNKNOWN STEP	2026-02-10T22:57:48.9892366Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
run	UNKNOWN STEP	2026-02-10T22:57:50.5209913Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
run	UNKNOWN STEP	2026-02-10T22:57:53.5767182Z 
run	UNKNOWN STEP	2026-02-10T22:57:53.5768311Z added 106 packages, and audited 107 packages in 6s
run	UNKNOWN STEP	2026-02-10T22:57:53.5768945Z 
run	UNKNOWN STEP	2026-02-10T22:57:53.5769304Z 18 packages are looking for funding
run	UNKNOWN STEP	2026-02-10T22:57:53.5769815Z   run `npm fund` for details
run	UNKNOWN STEP	2026-02-10T22:57:53.6464616Z 
run	UNKNOWN STEP	2026-02-10T22:57:53.6466328Z 6 vulnerabilities (2 moderate, 4 high)
run	UNKNOWN STEP	2026-02-10T22:57:53.6467271Z 
run	UNKNOWN STEP	2026-02-10T22:57:53.6468131Z To address all issues (including breaking changes), run:
run	UNKNOWN STEP	2026-02-10T22:57:53.6469350Z   npm audit fix --force
run	UNKNOWN STEP	2026-02-10T22:57:53.6469908Z 
run	UNKNOWN STEP	2026-02-10T22:57:53.6470288Z Run `npm audit` for details.
run	UNKNOWN STEP	2026-02-10T22:57:53.6729584Z ##[group]Run set -euo pipefail
run	UNKNOWN STEP	2026-02-10T22:57:53.6729922Z [36;1mset -euo pipefail[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6730148Z [36;1mif [ -n "" ]; then[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6730419Z [36;1m  echo "TIINGO_API_KEY=" >> "$GITHUB_ENV"[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6730952Z [36;1melif [ -n "***" ]; then[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6731407Z [36;1m  echo "TIINGO_API_KEY=***" >> "$GITHUB_ENV"[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6731869Z [36;1mfi[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6768169Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:53.6768437Z env:
run	UNKNOWN STEP	2026-02-10T22:57:53.6768618Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:53.6768839Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:53.6912038Z ##[group]Run node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
run	UNKNOWN STEP	2026-02-10T22:57:53.6912834Z [36;1mnode scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data[0m
run	UNKNOWN STEP	2026-02-10T22:57:53.6941435Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:53.6941708Z env:
run	UNKNOWN STEP	2026-02-10T22:57:53.6941911Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:53.6942257Z   TIINGO_API_KEY: ***
run	UNKNOWN STEP	2026-02-10T22:57:53.6942458Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:55.1612813Z OK: eod-latest artifacts generated (fetched=100/100)
run	UNKNOWN STEP	2026-02-10T22:57:55.1719529Z ##[group]Run node scripts/ops/build-safety-snapshot.mjs
run	UNKNOWN STEP	2026-02-10T22:57:55.1720291Z [36;1mnode scripts/ops/build-safety-snapshot.mjs[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.1762975Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:55.1763357Z env:
run	UNKNOWN STEP	2026-02-10T22:57:55.1763643Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:55.1764410Z   TIINGO_API_KEY: ***
run	UNKNOWN STEP	2026-02-10T22:57:55.1764772Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:55.2106339Z OK: safety snapshot generated (activeLocks=0)
run	UNKNOWN STEP	2026-02-10T22:57:55.2160854Z ##[group]Run npm run rv:ops
run	UNKNOWN STEP	2026-02-10T22:57:55.2161135Z [36;1mnpm run rv:ops[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.2190028Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:55.2190257Z env:
run	UNKNOWN STEP	2026-02-10T22:57:55.2190438Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:55.2190824Z   TIINGO_API_KEY: ***
run	UNKNOWN STEP	2026-02-10T22:57:55.2191038Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:55.3354251Z 
run	UNKNOWN STEP	2026-02-10T22:57:55.3926250Z > rv:ops
run	UNKNOWN STEP	2026-02-10T22:57:55.3926696Z > node scripts/ops/build-ops-daily.mjs
run	UNKNOWN STEP	2026-02-10T22:57:55.3926943Z 
run	UNKNOWN STEP	2026-02-10T22:57:55.3949460Z ##[group]Run node scripts/ops/build-mission-control-summary.mjs
run	UNKNOWN STEP	2026-02-10T22:57:55.3950112Z [36;1mnode scripts/ops/build-mission-control-summary.mjs[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.3981174Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:55.3981415Z env:
run	UNKNOWN STEP	2026-02-10T22:57:55.3981600Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:55.3982021Z   TIINGO_API_KEY: ***
run	UNKNOWN STEP	2026-02-10T22:57:55.3982236Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:55.4317623Z OK: ops summary generated (status=WARN)
run	UNKNOWN STEP	2026-02-10T22:57:55.4370575Z ##[group]Run node scripts/ops/validate-ops-summary.mjs
run	UNKNOWN STEP	2026-02-10T22:57:55.4370984Z [36;1mnode scripts/ops/validate-ops-summary.mjs[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4400325Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:55.4400573Z env:
run	UNKNOWN STEP	2026-02-10T22:57:55.4400776Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:55.4401168Z   TIINGO_API_KEY: ***
run	UNKNOWN STEP	2026-02-10T22:57:55.4401401Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:55.4712992Z OK: ops summary matches pipeline.latest
run	UNKNOWN STEP	2026-02-10T22:57:55.4783710Z ##[group]Run set -euo pipefail
run	UNKNOWN STEP	2026-02-10T22:57:55.4784258Z [36;1mset -euo pipefail[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4784788Z [36;1mgit config user.name "RubikVault Bot"[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4785629Z [36;1mgit config user.email "bot@rubikvault.com"[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4786850Z [36;1mgit add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4788024Z [36;1mif git diff --cached --quiet; then[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4788539Z [36;1m  echo "No staged changes"[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4788969Z [36;1m  exit 0[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4789298Z [36;1mfi[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4789794Z [36;1mgit commit -m "data(eod): update nasdaq100 latest" || exit 0[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4790412Z [36;1m[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4790736Z [36;1mfor i in 1 2 3; do[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4791201Z [36;1m  if git push origin HEAD:main; then[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4791693Z [36;1m    exit 0[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4792080Z [36;1m  fi[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4792515Z [36;1m  echo "push failed (attempt $i); retrying in 5s" >&2[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4793079Z [36;1m  sleep 5[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4793479Z [36;1m  git pull --rebase origin main || true[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4793980Z [36;1mdone[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4794368Z [36;1mecho "push failed after retries" >&2[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4794856Z [36;1mexit 1[0m
run	UNKNOWN STEP	2026-02-10T22:57:55.4837753Z shell: /usr/bin/bash -e {0}
run	UNKNOWN STEP	2026-02-10T22:57:55.4838175Z env:
run	UNKNOWN STEP	2026-02-10T22:57:55.4838496Z   RV_UNIVERSE: nasdaq100
run	UNKNOWN STEP	2026-02-10T22:57:55.4839146Z   TIINGO_API_KEY: ***
run	UNKNOWN STEP	2026-02-10T22:57:55.4839534Z ##[endgroup]
run	UNKNOWN STEP	2026-02-10T22:57:55.6251744Z [main eb10ea2] data(eod): update nasdaq100 latest
run	UNKNOWN STEP	2026-02-10T22:57:55.6252492Z  6 files changed, 1052 insertions(+), 399 deletions(-)
run	UNKNOWN STEP	2026-02-10T22:57:55.6253243Z  create mode 100644 public/data/eod/batches/eod.latest.000.json
run	UNKNOWN STEP	2026-02-10T22:57:56.1124962Z To https://github.com/RubikVault/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:56.1126350Z    2e0ae3d..eb10ea2  HEAD -> main
run	UNKNOWN STEP	2026-02-10T22:57:56.1263849Z Post job cleanup.
run	UNKNOWN STEP	2026-02-10T22:57:56.2917581Z Post job cleanup.
run	UNKNOWN STEP	2026-02-10T22:57:56.3837598Z [command]/usr/bin/git version
run	UNKNOWN STEP	2026-02-10T22:57:56.3872828Z git version 2.52.0
run	UNKNOWN STEP	2026-02-10T22:57:56.3914378Z Temporarily overriding HOME='/home/runner/work/_temp/2ed21d83-246b-449a-b06f-4f43258e1494' before making global git config changes
run	UNKNOWN STEP	2026-02-10T22:57:56.3915499Z Adding repository directory to the temporary git global config as a safe directory
run	UNKNOWN STEP	2026-02-10T22:57:56.3919906Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
run	UNKNOWN STEP	2026-02-10T22:57:56.3954583Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
run	UNKNOWN STEP	2026-02-10T22:57:56.3986632Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
run	UNKNOWN STEP	2026-02-10T22:57:56.4210602Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
run	UNKNOWN STEP	2026-02-10T22:57:56.4231512Z http.https://github.com/.extraheader
run	UNKNOWN STEP	2026-02-10T22:57:56.4243311Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
run	UNKNOWN STEP	2026-02-10T22:57:56.4273608Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
run	UNKNOWN STEP	2026-02-10T22:57:56.4493436Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
run	UNKNOWN STEP	2026-02-10T22:57:56.4523760Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
run	UNKNOWN STEP	2026-02-10T22:57:56.4848285Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Scheduler Kick
```
latest_run_id=21917167696
kick	Set up job	﻿2026-02-11T18:10:29.0900834Z Current runner version: '2.331.0'
kick	Set up job	2026-02-11T18:10:29.0925253Z ##[group]Runner Image Provisioner
kick	Set up job	2026-02-11T18:10:29.0926097Z Hosted Compute Agent
kick	Set up job	2026-02-11T18:10:29.0926744Z Version: 20260123.484
kick	Set up job	2026-02-11T18:10:29.0927369Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
kick	Set up job	2026-02-11T18:10:29.0928036Z Build Date: 2026-01-23T19:41:17Z
kick	Set up job	2026-02-11T18:10:29.0928730Z Worker ID: {2149317d-bcb6-494d-ac36-105817b8652e}
kick	Set up job	2026-02-11T18:10:29.0929811Z Azure Region: westus
kick	Set up job	2026-02-11T18:10:29.0930341Z ##[endgroup]
kick	Set up job	2026-02-11T18:10:29.0931815Z ##[group]Operating System
kick	Set up job	2026-02-11T18:10:29.0932414Z Ubuntu
kick	Set up job	2026-02-11T18:10:29.0932899Z 24.04.3
kick	Set up job	2026-02-11T18:10:29.0933407Z LTS
kick	Set up job	2026-02-11T18:10:29.0933893Z ##[endgroup]
kick	Set up job	2026-02-11T18:10:29.0934404Z ##[group]Runner Image
kick	Set up job	2026-02-11T18:10:29.0934907Z Image: ubuntu-24.04
kick	Set up job	2026-02-11T18:10:29.0935500Z Version: 20260201.15.1
kick	Set up job	2026-02-11T18:10:29.0936501Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
kick	Set up job	2026-02-11T18:10:29.0938173Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
kick	Set up job	2026-02-11T18:10:29.0939287Z ##[endgroup]
kick	Set up job	2026-02-11T18:10:29.0940348Z ##[group]GITHUB_TOKEN Permissions
kick	Set up job	2026-02-11T18:10:29.0942125Z Contents: read
kick	Set up job	2026-02-11T18:10:29.0942687Z Metadata: read
kick	Set up job	2026-02-11T18:10:29.0943416Z ##[endgroup]
kick	Set up job	2026-02-11T18:10:29.0945396Z Secret source: Actions
kick	Set up job	2026-02-11T18:10:29.0946163Z Prepare workflow directory
kick	Set up job	2026-02-11T18:10:29.1269637Z Prepare all required actions
kick	Set up job	2026-02-11T18:10:29.1375901Z Complete job name: kick
kick	Trigger scheduler	﻿2026-02-11T18:10:29.2104566Z ##[group]Run set -euo pipefail
kick	Trigger scheduler	2026-02-11T18:10:29.2105377Z [36;1mset -euo pipefail[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2106029Z [36;1m[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2106559Z [36;1mif [ -z "${RV_PROD_BASE:-}" ]; then[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2107392Z [36;1m  echo "RV_PROD_BASE is not set (GitHub Actions variable)" >&2[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2108390Z [36;1m  exit 1[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2108881Z [36;1mfi[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2109824Z [36;1mif [ -z "${RV_ADMIN_TOKEN:-}" ]; then[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2110625Z [36;1m  echo "RV_ADMIN_TOKEN is not set" >&2[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2111268Z [36;1m  exit 1[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2111757Z [36;1mfi[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2112212Z [36;1m[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2113002Z [36;1mpayload='{"job":"eod_stock","mode":"s2","universe":"nasdaq100"}'[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2113950Z [36;1mstatus=$(curl -sS -o /tmp/scheduler.json -w "%{http_code}" \[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2114767Z [36;1m  -X POST "${RV_PROD_BASE%/}/api/scheduler/run" \[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2115594Z [36;1m  -H "Content-Type: application/json" \[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2116612Z [36;1m  -H "Authorization: ***" \[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2117286Z [36;1m  --data "$payload")[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2117862Z [36;1m[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2118408Z [36;1mif [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2119421Z [36;1m  echo "Scheduler kick failed (HTTP $status)" >&2[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2120189Z [36;1m  cat /tmp/scheduler.json >&2 || true[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2120844Z [36;1m  exit 1[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2121391Z [36;1mfi[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2121852Z [36;1m[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2122434Z [36;1mjq -e '.ok | type == "boolean"' /tmp/scheduler.json >/dev/null[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2123426Z [36;1mjq -e '.meta.status | type == "string"' /tmp/scheduler.json >/dev/null[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2124422Z [36;1mjq -e '.meta.data_date | type == "string"' /tmp/scheduler.json >/dev/null[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2125238Z [36;1m[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2126152Z [36;1mjq -r '{ok, meta_status:.meta.status, job:(.data.job // null), run_id:(.data.run_id // null)}' /tmp/scheduler.json[0m
kick	Trigger scheduler	2026-02-11T18:10:29.2823624Z shell: /usr/bin/bash -e {0}
kick	Trigger scheduler	2026-02-11T18:10:29.2824821Z env:
kick	Trigger scheduler	2026-02-11T18:10:29.2825380Z   RV_PROD_BASE: https://rubikvault.com
kick	Trigger scheduler	2026-02-11T18:10:29.2826569Z   RV_ADMIN_TOKEN: ***
kick	Trigger scheduler	2026-02-11T18:10:29.2827195Z ##[endgroup]
kick	Trigger scheduler	2026-02-11T18:10:29.3986015Z Scheduler kick failed (HTTP 403)
kick	Trigger scheduler	2026-02-11T18:10:29.4040043Z <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}html{line-height:1.15;-webkit-text-size-adjust:100%;color:#313131;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}body{display:flex;flex-direction:column;height:100vh;min-height:100vh}.main-content{margin:8rem auto;padding-left:1.5rem;max-width:60rem}@media (width <= 720px){.main-content{margin-top:4rem}}.h2{line-height:2.25rem;font-size:1.5rem;font-weight:500}@media (width <= 720px){.h2{line-height:1.5rem;font-size:1.25rem}}#challenge-error-text{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI0IyMEYwMyIgZD0iTTE2IDNhMTMgMTMgMCAxIDAgMTMgMTNBMTMuMDE1IDEzLjAxNSAwIDAgMCAxNiAzbTAgMjRhMTEgMTEgMCAxIDEgMTEtMTEgMTEuMDEgMTEuMDEgMCAwIDEtMTEgMTEiLz48cGF0aCBmaWxsPSIjQjIwRjAzIiBkPSJNMTcuMDM4IDE4LjYxNUgxNC44N0wxNC41NjMgOS41aDIuNzgzem0tMS4wODQgMS40MjdxLjY2IDAgMS4wNTcuMzg4LjQwNy4zODkuNDA3Ljk5NCAwIC41OTYtLjQwNy45ODQtLjM5Ny4zOS0xLjA1Ny4zODktLjY1IDAtMS4wNTYtLjM4OS0uMzk4LS4zODktLjM5OC0uOTg0IDAtLjU5Ny4zOTgtLjk4NS40MDYtLjM5NyAxLjA1Ni0uMzk3Ii8+PC9zdmc+");background-repeat:no-repeat;background-size:contain;padding-left:34px}@media (prefers-color-scheme: dark){body{background-color:#222;color:#d9d9d9}}</style><meta http-equiv="refresh" content="360"></head><body><div class="main-wrapper" role="main"><div class="main-content"><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></div></div><script>(function(){window._cf_chl_opt = {cvId: '3',cZone: 'rubikvault.com',cType: 'managed',cRay: '9cc5cda5ac48ed3f',cH: 'wzbFrpC2KDRFHGybTnpeU_COO8AakwADD6JbA65uOqM-1770833429-1.2.1.1-elwCus9FZJER40NWHuqovmwKRzyVCO7b9jgERsnGjRmDq8QnuuCIB0L_Rh_EXT8C',cUPMDTk:"\/api\/scheduler\/run?__cf_chl_tk=X8mCv.keEnRTmYXbYXsaqyt1kqDeP_iwZENpD7lYPKs-1770833429-1.0.1.1-baOkzEjflBDOQJ6I4aAb6K3SpbpyLO490flRiK_INsY",cFPWv: 'g',cITimeS: '1770833429',cTplC:0,cTplV:5,cTplB: '0',fa:"\/api\/scheduler\/run?__cf_chl_f_tk=X8mCv.keEnRTmYXbYXsaqyt1kqDeP_iwZENpD7lYPKs-1770833429-1.0.1.1-baOkzEjflBDOQJ6I4aAb6K3SpbpyLO490flRiK_INsY",md: 'ye6b2x9ZwPvqbklZV43mpDrOGPaH77OiE97nuxbGg_Y-1770833429-1.2.1.1-LnudbUdcW03ggEMF0NBbkB48WxULpMrI6B_3NUojRSnN9KuoGQjjgAAQEVSazpyACbSx7fBDuzU15TLs7adNFEOlTJEAgqKnIkDN8ieNwLmCF5A7R3WCOTp0R3q8yOCSZEUEYuRLkcFC8q.WoeQWUCk95k8Tdhv9xH6ogeiZKVw_0.Fz0h8SxGUMUNCtF9d83JO4ltm.I7j6psB5xmCNcJgaUCjf4AmKKs2KcmUw2L8sYvnoD2_Dmm42rLyKkAnEIPFnyVUIrfh8hxcls9aPG.AgXptCErw87cY5rIDkPDAUHM1l9NiQlaCroDu4_kQuB8MKh2uEMh8u9XaITlBl3jS1obeFJa6BjSJ7G1E.h3I6XsDEpSDJq3Rd750o9hAu4mMwgYKVJ7PwFmvKSpQLsGOj7kVS2h64wYU0vkRFp_uba3lNsTTL16aUVLJDaL5Xb6N5qiLh_Vbu7hvjo9fCo3XKQeWJywbIJcGpBs6BCyYVECA4iiqRwJcokpPNJVj0DJYfO7K2avmkm0q4wF0zJI23Hui9jSrXTg4wEaRm8xkc0yfxbPPTW1wIcpwTYprt28rY8a_dwk4qPLGkxC7Fqh9hEFVGYuipmp66PVGwAOxFqlEvVHgz6l2p4pPicwvz3tBS__r6m6H5GQqR9OvHK0GK15AQdrCwiQXfpu_Zk721c2GXZKaQs2weyRAKf_MYGMt..uU_X.Fne22QzHNuyiQ9bLhFYts3zgxBMAisJX68Ull2yYDxOK91_rl9ckW1u4S81eXt2t8VbyHYbz7ESz2Ixe7lRYQW8.75xYGAERb1XPpM9UXg.4by3qEW4B4m',mdrd: 'fEKfNUjHrGXOp44684VCXmxdYL1ffUABSrmTIssg0kM-1770833429-1.2.1.1-1Rwbt6vph8NVDAwXIhW7H5cFbWVXZB765KaI6XQ1iwpvn9.YAP0IOBRcoeiRwp1IscKOFXBBu_W0spm8ImfM5jPuZCcu2IPBsROH2rMnQpyS8ZCMrE1ba3AYLOwQ21x.XR8Wi9BJ9pPrX1EUW2o8ZWI2qGVgYz1GcbrG4qVvT2gwaXmXS98NZucHQlEXCP3pj7H3Mhzqizh_JKDr3TjmbzrNk_yT73fpL7ePHPuJExyfoLwfC6dsJbGyk.gUApj6X2OO_v2pLZkAMMBNMqWGlkSEG4TUs6cspJS_bUk.aWmt0Ed2eTQG3OkS7Sh7FMNbmg9iW6IB.ULoZKz8PusqmOCgXitz0tIpYa7lSWqlkmJlBhxQX.zCg7XwFTvyTcE0ZTO.mi45cHgeMklDjHSzwmi1aCcZtQ0RA4w1oWp5KkiMZRuIpyK_DH3VcR13b._emXGXA1TaqX5zgBGpj4RYoEUW5R.OE0xasjlZN2dzIyVzE6jiXxgELA1jxseQnigfrUcgd_.zAdwiCFyppzluyc6V8a3zqzKkDEq5xBQhiBwCGhKjnKTn5kLloedza.4rDXYBfOmDZvU4iM9eT9jR39nck1Me_brPgdjbhSj6hh1O7Cb0lk971VtOE1LQ5deVdYTfHjEYKocvApb7RxAgE751GX03Up1sgVEILRSQSnmATSBYrtDdsIG8ajZi9UUxPiWo4cB2.254DyxhAy1jMM3HivSn4ltMiAdIDHrYN0AjYTpLy.agp1wZjt3Z1s00p3Nm_6odejrJ1RJf0oI0kN7lvqYHCbYj5NdwI2jnIA3dyX6fgaN9MgMs1vbT5mlUTnMq_HWzwkl5TQjIkS3v.DjleERQCMQD_Z6u73ggjVtiNo3ZyPsdj5GylrBgPsCubT5PMy.mlZ0K4_xkvvX59K7h45YCd8mBo4d4IxkluPedwqmNvCK1TKl1AHCE7FffRJ5JJ1wnLvLWWLpczLKA4PDH9flM45n2v.OuAbEvEixlAea14daWyNVVLhb0mlo8brCIpVxSVlX3VYi5U8t6lWvdg..XjbcRAAzItxpMgPHWyrQD3D3Ih8rWnAOOFQ6Dx3nHN1wrQifmWVonvXpXzpYNfPxq_av9WMP7aY2N0At4MhHwcS6pQlVITEKFlQsDoGRLKbj7krZtx7K1EPnPOTNyrfiaD1TmYOm.ms1TzgkFcURzFr4uwo3k.ADOpsQCCiOAouq0HBBErC86MgNmvhXUsNquLkTFEQLINb3vBc.9t87O9ivi6OXrkoV4.oiQsZNr5p93RBmQlzdsfBVbiXiQrBiZywgifGyIbB6WU.Nh9vCYJ2m9XFbZSLS3fFIvr_PVrcO.62IYUy_0uQ7hRFSB2NwV3GBCbDZYH.v75V6rn_bL8_EikbUTCYDTCcEyE_FMkdVx2fpv9C5Pcw4BOBwGR8KDPZx_5jH7prNI3jInd7uCifSogoI1kBf7VPGcW3VZvhYlCoX7NxlEGtiSwCAlV2wmyWC_al5UmK8_Lz3m2D0UjhLcnOztz5OqKm4LK7pBdaUXhNbpv6nWIyWynsmrqoz3RkqkG6bNbyTb7qwaJ.0rkO6TDzQuHjpNVbOrRkTL2snGivCQI1gBbBsA6JzosabdqJR96Ow9Y0BBZ87Orw2HS6rDwejkCkTqaCkKSvwSmGgqaHBHR3dQ.LFm6H5F9EFFgKqwBPCicIPmtXuzjsAvbF6Gf73rKMmGCi_fVngBUzPYdP18owkWkBqxa6MuGF5sxIElCVL0g3NAHJqZyoXVGCxIV5dYwtHxyccGTggjr30StqO64tanWIuWKhSWoQTIgLMk3nSYEtVlUU8T9KUaOk2a0QhD45Ykpu3n06jEkuO6ZDZgxGViQX7Nlxc67BGXYuDFa3vbqNxkIp866XUhTcPxmQCLmYNuxKEIVARFJkFQmQz8g7zHhzBu5lMspG.oto3zht8L4elwZpNZRXCrFtAh6mnhXUgJsND5.Sj4ItVNwV6dRjBdiVgGZV6kig5IutdO.hjNROR3CjBqIKqMufi77ehM3Jl95wsLEFqJqklFXY89hyaIIkQ9qLIU3si3p_Xm6doQklgh1M8uHIf02wil_d.lM9AatUsCHp3O6B32l2hPIHNaOKYSwOY8ZEHlvJ7nvWQZkRp64ZfXMK5R5kt0qq8lqP6DgzGfpV7lZQCIoJOeB8l7UQ5UJeNX_66UwL8C1EYRURLjihemdWSJo_azYaJXUdiZsn76sRucpBTAuBrR52ErR2Gho0b9wUJZVtqzC.EwwGJ7caXsxglCVqiUfRYMQLKQ8p2EU7kQmYtvkogYb1naQF9VUHrQnptomiQnAhKq7ytSgqAOiIdFCRonrbukX_O.jsKx6JVNvVt7WYkNRm1Bmyjvl9tlDphC_HJBhdlg6mEE81zyN70vVxlBCtqSK0kQLCVdKyY9Rze.TPRxY3kVkqJ8_M2SixYvovl6kJ7jzFQ8GLajMApEBCgFN.TN527U.GyB4E1TCu3B7iF9hpSd5Yr0PSgtbyzw0mHjcgvJP8M7qu1lUtyHEB_At.NjDan3EoMiAA2gQGlx3E.bDVm5Uv9DMe1poVd.UkNR_TmijFL6RS5U8PiJmxlIC.rZo8.BSOqdGbTUYVunQUW8G6V9Bt6LU5XcsKYojUWsx5GCgQpLDjA',};var a = document.createElement('script');a.src = '/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=9cc5cda5ac48ed3f';window._cf_chl_opt.cOgUHash = location.hash === '' && location.href.indexOf('#') !== -1 ? '#' : location.hash;window._cf_chl_opt.cOgUQuery = location.search === '' && location.href.slice(0, location.href.length - window._cf_chl_opt.cOgUHash.length).indexOf('?') !== -1 ? '?' : location.search;if (window.history && window.history.replaceState) {var ogU = location.pathname + window._cf_chl_opt.cOgUQuery + window._cf_chl_opt.cOgUHash;history.replaceState(null, null,"\/api\/scheduler\/run?__cf_chl_rt_tk=X8mCv.keEnRTmYXbYXsaqyt1kqDeP_iwZENpD7lYPKs-1770833429-1.0.1.1-baOkzEjflBDOQJ6I4aAb6K3SpbpyLO490flRiK_INsY"+ window._cf_chl_opt.cOgUHash);a.onload = function() {history.replaceState(null, null, ogU);}}document.getElementsByTagName('head')[0].appendChild(a);}());</script></body></html>
kick	Trigger scheduler	2026-02-11T18:10:29.4112387Z ##[error]Process completed with exit code 1.
kick	Complete job	﻿2026-02-11T18:10:29.4230453Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: e2e-playwright
```
latest_run_id=21829656565
ops-e2e	UNKNOWN STEP	﻿2026-02-09T14:47:03.0440972Z Current runner version: '2.331.0'
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0463908Z ##[group]Runner Image Provisioner
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0464770Z Hosted Compute Agent
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0465304Z Version: 20260123.484
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0465883Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0466543Z Build Date: 2026-01-23T19:41:17Z
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0467271Z Worker ID: {1dce26fd-2ae2-4815-b3bf-e8c75cace933}
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0467908Z Azure Region: westus
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0468421Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0469802Z ##[group]Operating System
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0470575Z Ubuntu
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0471046Z 24.04.3
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0471598Z LTS
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0472052Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0472502Z ##[group]Runner Image
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0473081Z Image: ubuntu-24.04
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0473540Z Version: 20260201.15.1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0475102Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0476568Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0477458Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0480199Z ##[group]GITHUB_TOKEN Permissions
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0482438Z Actions: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0483018Z ArtifactMetadata: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0483585Z Attestations: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0484083Z Checks: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0484561Z Contents: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0485068Z Deployments: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0485572Z Discussions: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0486099Z Issues: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0486561Z Metadata: read
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0487054Z Models: read
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0487480Z Packages: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0488030Z Pages: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0488625Z PullRequests: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0489107Z RepositoryProjects: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0489728Z SecurityEvents: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0490213Z Statuses: write
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0491146Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0493269Z Secret source: Actions
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.0493991Z Prepare workflow directory
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.1028715Z Prepare all required actions
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.1065243Z Getting action download info
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.5487096Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.6674731Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.8532867Z Complete job name: ops-e2e
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9155689Z ##[group]Run actions/checkout@v4
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9156494Z with:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9156907Z   repository: RubikVault/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9157581Z   token: ***
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9157951Z   ssh-strict: true
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9158337Z   ssh-user: git
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9158731Z   persist-credentials: true
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9159177Z   clean: true
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9159572Z   sparse-checkout-cone-mode: true
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9160052Z   fetch-depth: 1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9160630Z   fetch-tags: false
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9161035Z   show-progress: true
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9161434Z   lfs: false
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9161794Z   submodules: false
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9162188Z   set-safe-directory: true
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9162860Z env:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9163250Z   BASE_URL: https://rubikvault.com
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:03.9163730Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0280870Z Syncing repository: RubikVault/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0283504Z ##[group]Getting Git version info
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0284781Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0286720Z [command]/usr/bin/git version
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0341362Z git version 2.52.0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0367104Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0389126Z Temporarily overriding HOME='/home/runner/work/_temp/8f6b37da-4ae5-492e-b9a2-c9b9e3600e46' before making global git config changes
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0390702Z Adding repository directory to the temporary git global config as a safe directory
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0394825Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0435004Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0438409Z ##[group]Initializing the repository
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0442913Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0565942Z hint: Using 'master' as the name for the initial branch. This default branch name
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0567344Z hint: will change to "main" in Git 3.0. To configure the initial branch name
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0568653Z hint: to use in all of your new repositories, which will suppress this warning,
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0569681Z hint: call:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0570569Z hint:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0571629Z hint: 	git config --global init.defaultBranch <name>
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0572480Z hint:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0573253Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0574589Z hint: 'development'. The just-created branch can be renamed via this command:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0575548Z hint:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0576144Z hint: 	git branch -m <name>
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0576956Z hint:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0577746Z hint: Disable this message with "git config set advice.defaultBranchName false"
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0578994Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0582073Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0616302Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0617060Z ##[group]Disabling automatic garbage collection
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0620521Z [command]/usr/bin/git config --local gc.auto 0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0649078Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0649745Z ##[group]Setting up auth
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0656355Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.0686283Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1047877Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1076962Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1299502Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1333420Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1559026Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1594056Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1594913Z ##[group]Fetching the repository
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:04.1602751Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4732204Z From https://github.com/RubikVault/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4735002Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4781033Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4782997Z ##[group]Determining the checkout info
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4785159Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4789261Z [command]/usr/bin/git sparse-checkout disable
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4833284Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4861430Z ##[group]Checking out the ref
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.4865457Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6013133Z Switched to a new branch 'main'
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6015411Z branch 'main' set up to track 'origin/main'.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6031517Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6068286Z [command]/usr/bin/git log -1 --format=%H
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6090826Z 166a15246fc75b11da12b0f8504ef8fb77a01229
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6408197Z ##[group]Run actions/setup-node@v4
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6409333Z with:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6410110Z   node-version: 20
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6411177Z   cache: npm
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6412007Z   always-auth: false
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6412920Z   check-latest: false
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6414088Z   token: ***
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6414882Z env:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6415713Z   BASE_URL: https://rubikvault.com
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.6416818Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.8214254Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:05.8219336Z ##[group]Environment details
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.1889870Z node: v20.20.0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.1891640Z npm: 10.8.2
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.1891904Z yarn: 1.22.22
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.1892643Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.1912273Z [command]/opt/hostedtoolcache/node/20.20.0/x64/bin/npm config get cache
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.3068631Z /home/runner/.npm
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:06.6253353Z Cache hit for: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:07.9470646Z Received 0 of 69391852 (0.0%), 0.0 MBs/sec
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:08.8738160Z Received 69391852 of 69391852 (100.0%), 34.3 MBs/sec
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:08.8739112Z Cache Size: ~66 MB (69391852 B)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:08.8778370Z [command]/usr/bin/tar -xf /home/runner/work/_temp/c30adb5c-a282-4e26-a698-40356fcd8a24/cache.tzst -P -C /home/runner/work/rubikvault-site/rubikvault-site --use-compress-program unzstd
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0491979Z Cache restored successfully
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0636202Z Cache restored from key: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0807970Z ##[group]Run npm ci
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0808275Z [36;1mnpm ci[0m
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0853601Z shell: /usr/bin/bash -e {0}
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0853903Z env:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0854175Z   BASE_URL: https://rubikvault.com
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:09.0854475Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:10.8239754Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:10.8758713Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:13.7695087Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.2970892Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.2971737Z added 106 packages, and audited 107 packages in 5s
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.2979298Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.2979877Z 18 packages are looking for funding
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.2980552Z   run `npm fund` for details
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3585798Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3586965Z 6 vulnerabilities (2 moderate, 4 high)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3587629Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3588200Z To address all issues (including breaking changes), run:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3589054Z   npm audit fix --force
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3589413Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.3589696Z Run `npm audit` for details.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.4001094Z ##[group]Run npx playwright install --with-deps
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.4001744Z [36;1mnpx playwright install --with-deps[0m
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.4035176Z shell: /usr/bin/bash -e {0}
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.4035423Z env:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.4035626Z   BASE_URL: https://rubikvault.com
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:14.4035887Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.3547396Z Installing dependencies...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.3655590Z Switching to root user to install dependencies...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.4393603Z Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist [144 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.4698270Z Get:6 https://packages.microsoft.com/repos/azure-cli noble InRelease [3564 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.4795082Z Get:7 https://packages.microsoft.com/ubuntu/24.04/prod noble InRelease [3600 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.5464614Z Get:8 https://packages.microsoft.com/repos/azure-cli noble/main amd64 Packages [2163 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.5930501Z Get:9 https://packages.microsoft.com/ubuntu/24.04/prod noble/main amd64 Packages [89.4 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.5979284Z Get:10 https://packages.microsoft.com/ubuntu/24.04/prod noble/main arm64 Packages [68.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.7430846Z Hit:2 http://azure.archive.ubuntu.com/ubuntu noble InRelease
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.7441759Z Get:3 http://azure.archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.7468869Z Get:4 http://azure.archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.7488454Z Get:5 http://azure.archive.ubuntu.com/ubuntu noble-security InRelease [126 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8496298Z Get:11 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [1740 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8625052Z Get:12 http://azure.archive.ubuntu.com/ubuntu noble-updates/main Translation-en [324 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8633389Z Get:13 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 Components [175 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8658826Z Get:14 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 c-n-f Metadata [16.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8674948Z Get:15 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 Packages [1528 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8769768Z Get:16 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe Translation-en [313 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8798401Z Get:17 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 Components [386 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8822668Z Get:18 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 c-n-f Metadata [31.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8859530Z Get:19 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted amd64 Packages [2588 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.8982856Z Get:20 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted Translation-en [593 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9463004Z Get:21 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted amd64 Components [212 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9474951Z Get:22 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Packages [32.1 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9487353Z Get:23 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Components [940 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9496361Z Get:24 http://azure.archive.ubuntu.com/ubuntu noble-backports/main amd64 Components [7284 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9507991Z Get:25 http://azure.archive.ubuntu.com/ubuntu noble-backports/universe amd64 Components [10.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9515013Z Get:26 http://azure.archive.ubuntu.com/ubuntu noble-backports/restricted amd64 Components [216 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9528281Z Get:27 http://azure.archive.ubuntu.com/ubuntu noble-backports/multiverse amd64 Components [212 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9672649Z Get:28 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 Packages [1446 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9757513Z Get:29 http://azure.archive.ubuntu.com/ubuntu noble-security/main Translation-en [234 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9776310Z Get:30 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 Components [21.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9786456Z Get:31 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 c-n-f Metadata [9888 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9796377Z Get:32 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 Packages [929 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9848395Z Get:33 http://azure.archive.ubuntu.com/ubuntu noble-security/universe Translation-en [212 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:15.9867143Z Get:34 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 Components [74.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:16.0304115Z Get:35 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 c-n-f Metadata [19.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:16.0321857Z Get:36 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted amd64 Packages [2445 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:16.0440313Z Get:37 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted Translation-en [562 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:16.0473426Z Get:38 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted amd64 Components [208 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:16.0485718Z Get:39 http://azure.archive.ubuntu.com/ubuntu noble-security/multiverse amd64 Components [208 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:24.8829539Z Fetched 14.2 MB in 2s (7788 kB/s)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.6408772Z Reading package lists...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.6675359Z Reading package lists...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8359377Z Building dependency tree...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8366754Z Reading state information...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8533644Z libasound2t64 is already the newest version (1.2.11-1ubuntu0.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8534911Z libasound2t64 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8536422Z libatk-bridge2.0-0t64 is already the newest version (2.52.0-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8538063Z libatk-bridge2.0-0t64 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8539707Z libatk1.0-0t64 is already the newest version (2.52.0-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8541511Z libatk1.0-0t64 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8542828Z libatspi2.0-0t64 is already the newest version (2.52.0-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8544056Z libatspi2.0-0t64 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8545203Z libcairo2 is already the newest version (1.18.0-3build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8546236Z libcairo2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8547521Z libcups2t64 is already the newest version (2.4.7-1.2ubuntu7.9).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8548674Z libcups2t64 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8549889Z libdbus-1-3 is already the newest version (1.14.10-4ubuntu4.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8551365Z libdbus-1-3 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8552687Z libdrm2 is already the newest version (2.4.125-1ubuntu0.1~24.04.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8553977Z libdrm2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8554796Z libgbm1 is already the newest version (25.2.8-0ubuntu0.24.04.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8555604Z libgbm1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8556376Z libnspr4 is already the newest version (2:4.35-1.1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8557154Z libnspr4 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8557950Z libnss3 is already the newest version (2:3.98-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8558728Z libnss3 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8559555Z libpango-1.0-0 is already the newest version (1.52.1+ds-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8560554Z libpango-1.0-0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8561306Z libx11-6 is already the newest version (2:1.8.7-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8561991Z libx11-6 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8562694Z libxcb1 is already the newest version (1.15-1ubuntu2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8563347Z libxcb1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8564133Z libxcomposite1 is already the newest version (1:0.4.5-1build3).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8564962Z libxcomposite1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8565751Z libxdamage1 is already the newest version (1:1.1.6-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8566472Z libxdamage1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8567193Z libxext6 is already the newest version (2:1.3.4-1build2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8567860Z libxext6 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8569077Z libxfixes3 is already the newest version (1:6.0.0-2build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8569810Z libxfixes3 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8570751Z libxkbcommon0 is already the newest version (1.6.0-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8571463Z libxkbcommon0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8572184Z libxrandr2 is already the newest version (2:1.5.2-2build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8572835Z libxrandr2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8573603Z libcairo-gobject2 is already the newest version (1.18.0-3build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8574380Z libcairo-gobject2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8575167Z libfontconfig1 is already the newest version (2.15.0-1.1ubuntu2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8576131Z libfontconfig1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8576875Z libfreetype6 is already the newest version (2.13.2+dfsg-1build3).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8577597Z libfreetype6 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8578436Z libgdk-pixbuf-2.0-0 is already the newest version (2.42.10+dfsg-3ubuntu3.2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8579294Z libgdk-pixbuf-2.0-0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8580070Z libgtk-3-0t64 is already the newest version (3.24.41-4ubuntu1.3).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8581003Z libgtk-3-0t64 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8581809Z libpangocairo-1.0-0 is already the newest version (1.52.1+ds-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8582642Z libpangocairo-1.0-0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8583439Z libx11-xcb1 is already the newest version (2:1.8.7-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8584120Z libx11-xcb1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8584836Z libxcb-shm0 is already the newest version (1.15-1ubuntu2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8585531Z libxcb-shm0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8586257Z libxcursor1 is already the newest version (1:1.2.1-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8586842Z libxcursor1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8587220Z libxi6 is already the newest version (2:1.8.1-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8587581Z libxi6 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8587966Z libxrender1 is already the newest version (1:0.9.10-1.1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8588340Z libxrender1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8588730Z libicu74 is already the newest version (74.2-1ubuntu3.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8589204Z libatomic1 is already the newest version (14.2.0-4ubuntu2~24.04).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8589641Z libatomic1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8590022Z libenchant-2-2 is already the newest version (2.3.3-2build2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8590680Z libenchant-2-2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8591083Z libepoxy0 is already the newest version (1.5.10-1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8591443Z libepoxy0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8591846Z libgstreamer1.0-0 is already the newest version (1.24.2-1ubuntu0.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8592252Z libgstreamer1.0-0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8592657Z libharfbuzz0b is already the newest version (8.3.0-2build2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8593038Z libharfbuzz0b set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8593440Z libjpeg-turbo8 is already the newest version (2.1.5-2ubuntu2).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8593808Z libjpeg-turbo8 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8594175Z liblcms2-2 is already the newest version (2.14-2build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8594519Z liblcms2-2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8594920Z libwayland-client0 is already the newest version (1.22.0-2.1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.8595830Z libwayland-client0 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9985230Z libwayland-egl1 is already the newest version (1.22.0-2.1build1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9986299Z libwayland-egl1 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9987390Z libwebp7 is already the newest version (1.3.2-0.4build3).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9988300Z libwebp7 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9989296Z libwebpdemux2 is already the newest version (1.3.2-0.4build3).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9990282Z libwebpdemux2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9991926Z libxml2 is already the newest version (2.9.14+dfsg-1.3ubuntu3.7).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9992568Z libxml2 set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9993196Z xvfb is already the newest version (2:21.1.12-1ubuntu1.5).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9994047Z fonts-noto-color-emoji is already the newest version (2.047-0ubuntu0.24.04.1).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9994904Z fonts-liberation is already the newest version (1:2.1.5-3).
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9995567Z fonts-liberation set to manually installed.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9996558Z The following additional packages will be installed:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9997253Z   gir1.2-glib-2.0 glib-networking glib-networking-common
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9998250Z   glib-networking-services gsettings-desktop-schemas libaa1 libabsl20220623t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9999146Z   libass9 libasyncns0 libavc1394-0 libavcodec60 libavfilter9 libavformat60
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:25.9999900Z   libavtp0 libavutil58 libblas3 libbluray2 libbs2b0 libcaca0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0000867Z   libcairo-script-interpreter2 libcdparanoia0 libchromaprint1 libcjson1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0001631Z   libcodec2-1.2 libdav1d7 libdc1394-25 libdca0 libdecor-0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0002361Z   libdirectfb-1.7-7t64 libdv4t64 libdvdnav4 libdvdread8t64 libegl-mesa0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0003159Z   libegl1 libfaad2 libflac12t64 libfluidsynth3 libfreeaptx0 libgav1-1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0003922Z   libglib2.0-bin libglib2.0-data libgme0 libgraphene-1.0-0 libgsm1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0004755Z   libgssdp-1.6-0 libgstreamer-plugins-good1.0-0 libgtk-4-common libgupnp-1.6-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0005580Z   libgupnp-igd-1.6-0 libhwy1t64 libiec61883-0 libimath-3-1-29t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0006333Z   libinstpatch-1.0-2 libjack-jackd2-0 libjxl0.7 liblapack3 liblc3-1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0006908Z   libldacbt-enc2 liblilv-0-0 liblrdf0 libltc11 libmbedcrypto7t64 libmfx1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0007427Z   libmjpegutils-2.1-0t64 libmodplug1 libmp3lame0 libmpcdec6
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0008243Z   libmpeg2encpp-2.1-0t64 libmpg123-0t64 libmplex2-2.1-0t64 libmysofa1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0008820Z   libneon27t64 libnice10 libopenal-data libopenal1 libopenexr-3-1-30
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0009323Z   libopenh264-7 libopenmpt0t64 libopenni2-0 liborc-0.4-0t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0009816Z   libpipewire-0.3-0t64 libplacebo338 libpocketsphinx3 libpostproc57
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0010560Z   libproxy1v5 libpulse0 libqrencode4 libraptor2-0 librav1e0 libraw1394-11
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0011144Z   librist4 librsvg2-2 librubberband2 libsamplerate0 libsbc1 libsdl2-2.0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0011729Z   libsecret-common libserd-0-0 libshine3 libshout3 libsndfile1 libsndio7.0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0012293Z   libsord-0-0 libsoundtouch1 libsoup-3.0-0 libsoup-3.0-common libsoxr0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0012875Z   libspa-0.2-modules libspandsp2t64 libspeex1 libsphinxbase3t64 libsratom-0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0013453Z   libsrt1.5-gnutls libsrtp2-1 libssh-4 libssh-gcrypt-4 libsvtav1enc1d1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0013985Z   libswresample4 libswscale7 libtag1v5 libtag1v5-vanilla libtheora0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0014520Z   libtwolame0 libudfread0 libunibreak5 libv4l-0t64 libv4lconvert0t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0015058Z   libva-drm2 libva-x11-2 libva2 libvdpau1 libvidstab1.1 libvisual-0.4-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0015591Z   libvo-aacenc0 libvo-amrwbenc0 libvorbisenc2 libvpl2 libwavpack1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0016120Z   libwebrtc-audio-processing1 libwildmidi2 libx265-199 libxcb-xkb1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0016632Z   libxkbcommon-x11-0 libxvidcore4 libyuv0 libzbar0t64 libzimg2 libzix-0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0017175Z   libzvbi-common libzvbi0t64 libzxing3 ocl-icd-libopencl1 session-migration
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0017641Z   timgm6mb-soundfont xfonts-encodings xfonts-utils
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0017970Z Suggested packages:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0018333Z   frei0r-plugins gvfs libcuda1 libnvcuvid1 libnvidia-encode1 libbluray-bdj
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0018843Z   libdirectfb-extra libdv-bin oss-compat libdvdcss2 low-memory-monitor
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0019528Z   libvisual-0.4-plugins jackd2 liblrdf0-dev libportaudio2 opus-tools pipewire
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0020164Z   pulseaudio raptor2-utils libraw1394-doc librsvg2-bin serdi sndiod sordi
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0020829Z   speex libwildmidi-config opencl-icd fluid-soundfont-gm
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0021158Z Recommended packages:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0021474Z   fonts-ipafont-mincho fonts-tlwg-loma gstreamer1.0-x libaacs0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0021948Z   default-libdecor-0-plugin-1 | libdecor-0-plugin-1 gstreamer1.0-gl
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0022494Z   libgtk-4-bin librsvg2-common libgtk-4-media-gstreamer libpipewire-0.3-common
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0023075Z   pocketsphinx-en-us va-driver-all | va-driver vdpau-driver-all | vdpau-driver
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0023609Z   libmagickcore-6.q16-7-extra
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0783737Z The following NEW packages will be installed:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0784705Z   fonts-freefont-ttf fonts-ipafont-gothic fonts-tlwg-loma-otf fonts-unifont
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0785657Z   fonts-wqy-zenhei glib-networking glib-networking-common
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0786661Z   glib-networking-services gsettings-desktop-schemas gstreamer1.0-libav
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0787949Z   gstreamer1.0-plugins-bad gstreamer1.0-plugins-base gstreamer1.0-plugins-good
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0789155Z   libaa1 libabsl20220623t64 libass9 libasyncns0 libavc1394-0 libavcodec60
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0790136Z   libavfilter9 libavformat60 libavif16 libavtp0 libavutil58 libblas3
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0791535Z   libbluray2 libbs2b0 libcaca0 libcairo-script-interpreter2 libcdparanoia0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0792585Z   libchromaprint1 libcjson1 libcodec2-1.2 libdav1d7 libdc1394-25 libdca0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0793602Z   libdecor-0-0 libdirectfb-1.7-7t64 libdv4t64 libdvdnav4 libdvdread8t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0794703Z   libegl-mesa0 libegl1 libevent-2.1-7t64 libfaad2 libflac12t64 libflite1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0795944Z   libfluidsynth3 libfreeaptx0 libgav1-1 libgles2 libgme0 libgraphene-1.0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0797240Z   libgsm1 libgssdp-1.6-0 libgstreamer-gl1.0-0 libgstreamer-plugins-bad1.0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0798345Z   libgstreamer-plugins-base1.0-0 libgstreamer-plugins-good1.0-0 libgtk-4-1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0799271Z   libgtk-4-common libgupnp-1.6-0 libgupnp-igd-1.6-0 libharfbuzz-icu0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0800178Z   libhwy1t64 libhyphen0 libiec61883-0 libimath-3-1-29t64 libinstpatch-1.0-2
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0801246Z   libjack-jackd2-0 libjxl0.7 liblapack3 liblc3-1 libldacbt-enc2 liblilv-0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0802101Z   liblrdf0 libltc11 libmanette-0.2-0 libmbedcrypto7t64 libmfx1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0802914Z   libmjpegutils-2.1-0t64 libmodplug1 libmp3lame0 libmpcdec6
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0803741Z   libmpeg2encpp-2.1-0t64 libmpg123-0t64 libmplex2-2.1-0t64 libmysofa1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0804721Z   libneon27t64 libnice10 libopenal-data libopenal1 libopenexr-3-1-30
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0805562Z   libopenh264-7 libopenmpt0t64 libopenni2-0 libopus0 liborc-0.4-0t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0806380Z   libpipewire-0.3-0t64 libplacebo338 libpocketsphinx3 libpostproc57
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0807254Z   libproxy1v5 libpulse0 libqrencode4 libraptor2-0 librav1e0 libraw1394-11
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0808145Z   librist4 librsvg2-2 librubberband2 libsamplerate0 libsbc1 libsdl2-2.0-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0809053Z   libsecret-1-0 libsecret-common libserd-0-0 libshine3 libshout3 libsndfile1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0810026Z   libsndio7.0 libsord-0-0 libsoundtouch1 libsoup-3.0-0 libsoup-3.0-common
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0811106Z   libsoxr0 libspa-0.2-modules libspandsp2t64 libspeex1 libsphinxbase3t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0812094Z   libsratom-0-0 libsrt1.5-gnutls libsrtp2-1 libssh-gcrypt-4 libsvtav1enc1d1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0812957Z   libswresample4 libswscale7 libtag1v5 libtag1v5-vanilla libtheora0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0813792Z   libtwolame0 libudfread0 libunibreak5 libv4l-0t64 libv4lconvert0t64
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0814668Z   libva-drm2 libva-x11-2 libva2 libvdpau1 libvidstab1.1 libvisual-0.4-0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0815593Z   libvo-aacenc0 libvo-amrwbenc0 libvorbisenc2 libvpl2 libvpx9 libwavpack1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0816934Z   libwayland-server0 libwebrtc-audio-processing1 libwildmidi2 libwoff1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0817870Z   libx264-164 libx265-199 libxcb-xkb1 libxkbcommon-x11-0 libxvidcore4 libyuv0
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0818737Z   libzbar0t64 libzimg2 libzix-0-0 libzvbi-common libzvbi0t64 libzxing3
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0819639Z   ocl-icd-libopencl1 session-migration timgm6mb-soundfont xfonts-cyrillic
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0820553Z   xfonts-encodings xfonts-scalable xfonts-utils
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0821151Z The following packages will be upgraded:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0821786Z   gir1.2-glib-2.0 libglib2.0-0t64 libglib2.0-bin libglib2.0-data
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.0822392Z   libpng16-16t64 libssh-4 libxslt1.1
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.1030987Z 7 upgraded, 180 newly installed, 0 to remove and 100 not upgraded.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.1031732Z Need to get 116 MB of archives.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.1032455Z After this operation, 363 MB of additional disk space will be used.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.1033272Z Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist [144 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.1879354Z Get:2 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 fonts-ipafont-gothic all 00303-21ubuntu1 [3513 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.6745080Z Get:3 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libglib2.0-data all 2.80.0-6ubuntu3.8 [49.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.7434787Z Get:4 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libglib2.0-bin amd64 2.80.0-6ubuntu3.8 [97.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.8160006Z Get:5 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 gir1.2-glib-2.0 amd64 2.80.0-6ubuntu3.8 [183 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.8883366Z Get:6 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libglib2.0-0t64 amd64 2.80.0-6ubuntu3.8 [1545 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:26.9994484Z Get:7 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libpng16-16t64 amd64 1.6.43-5ubuntu0.4 [188 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.0695695Z Get:8 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 fonts-freefont-ttf all 20211204+svn4273-2 [5641 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.2591000Z Get:9 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 fonts-tlwg-loma-otf all 1:0.7.3-1 [107 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.3286984Z Get:10 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 fonts-unifont all 1:15.1.01-1build1 [2993 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.4252979Z Get:11 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 fonts-wqy-zenhei all 0.9.45-8 [7472 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.6799958Z Get:12 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libproxy1v5 amd64 0.5.4-4build1 [26.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.7411923Z Get:13 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 glib-networking-common all 2.80.0-1build1 [6702 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.8026664Z Get:14 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 glib-networking-services amd64 2.80.0-1build1 [12.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.8636777Z Get:15 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 session-migration amd64 0.3.9build1 [9034 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.9245027Z Get:16 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 gsettings-desktop-schemas all 46.1-0ubuntu1 [35.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:27.9855285Z Get:17 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 glib-networking amd64 2.80.0-1build1 [64.1 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.0487351Z Get:18 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 libva2 amd64 2.20.0-2ubuntu0.1 [66.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.1126682Z Get:19 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 libva-drm2 amd64 2.20.0-2ubuntu0.1 [7132 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.1739787Z Get:20 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 libva-x11-2 amd64 2.20.0-2ubuntu0.1 [12.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.2347725Z Get:21 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libvdpau1 amd64 1.5-2build1 [27.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.2961292Z Get:22 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libvpl2 amd64 2023.3.0-1build1 [99.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.3590642Z Get:23 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 ocl-icd-libopencl1 amd64 2.3.2-1build1 [38.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.4222018Z Get:24 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libavutil58 amd64 7:6.1.1-3ubuntu5 [401 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.4856177Z Get:25 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libcodec2-1.2 amd64 1.2.0-2build1 [8998 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.7334474Z Get:26 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libdav1d7 amd64 1.4.1-1build1 [604 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.8038777Z Get:27 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libgsm1 amd64 1.0.22-1build1 [27.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.8655827Z Get:28 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libhwy1t64 amd64 1.0.7-8.1build1 [584 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:28.9642550Z Get:29 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 libjxl0.7 amd64 0.7.0-10.2ubuntu6.1 [1001 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.0362295Z Get:30 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libmp3lame0 amd64 3.100-6build1 [142 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.0994377Z Get:31 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libopus0 amd64 1.4-1build1 [208 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.1627430Z Get:32 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 librav1e0 amd64 0.7.1-2 [1022 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.2423463Z Get:33 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 librsvg2-2 amd64 2.58.0+dfsg-1build1 [2135 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.3492404Z Get:34 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libshine3 amd64 3.1.1-2build1 [23.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.4108566Z Get:35 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libspeex1 amd64 1.2.1-2ubuntu2.24.04.1 [59.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.4728007Z Get:36 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsvtav1enc1d1 amd64 1.7.0+dfsg-2build1 [2425 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.5787095Z Get:37 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsoxr0 amd64 0.1.3-4build3 [80.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.6406445Z Get:38 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libswresample4 amd64 7:6.1.1-3ubuntu5 [63.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.7027882Z Get:39 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libtheora0 amd64 1.1.1+dfsg.1-16.1build3 [211 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.7660031Z Get:40 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libtwolame0 amd64 0.4.0-2build3 [52.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.8277582Z Get:41 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libvorbisenc2 amd64 1.3.7-1build3 [80.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.8898300Z Get:42 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libvpx9 amd64 1.14.0-1ubuntu2.2 [1143 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:29.9722009Z Get:43 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libx264-164 amd64 2:0.164.3108+git31e19f9-1 [604 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.0430590Z Get:44 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libx265-199 amd64 3.5-2build1 [1226 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.1332377Z Get:45 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libxvidcore4 amd64 2:1.3.7-1build1 [219 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.1966384Z Get:46 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libzvbi-common all 0.2.42-2 [42.4 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.2576794Z Get:47 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libzvbi0t64 amd64 0.2.42-2 [261 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.3242882Z Get:48 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libavcodec60 amd64 7:6.1.1-3ubuntu5 [5851 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.4988986Z Get:49 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libunibreak5 amd64 5.1-2build1 [25.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.5603498Z Get:50 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libass9 amd64 1:0.17.1-2build1 [104 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.6228381Z Get:51 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libudfread0 amd64 1.1.2-1build1 [19.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.6852110Z Get:52 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libbluray2 amd64 1:1.3.4-1build1 [159 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.7485792Z Get:53 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libchromaprint1 amd64 1.5.1-5 [30.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.8112941Z Get:54 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libgme0 amd64 0.6.3-7build1 [134 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.8739197Z Get:55 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libmpg123-0t64 amd64 1.32.5-1ubuntu1.1 [169 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:30.9362822Z Get:56 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libopenmpt0t64 amd64 0.7.3-1.1build3 [647 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.0081880Z Get:57 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libcjson1 amd64 1.7.17-1 [24.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.0702300Z Get:58 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmbedcrypto7t64 amd64 2.28.8-1 [209 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.1364474Z Get:59 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 librist4 amd64 0.2.10+dfsg-2 [74.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.1982612Z Get:60 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsrt1.5-gnutls amd64 1.5.3-1build2 [316 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.2678845Z Get:61 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libssh-gcrypt-4 amd64 0.10.6-2ubuntu0.2 [224 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.3367029Z Get:62 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libavformat60 amd64 7:6.1.1-3ubuntu5 [1153 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.4181249Z Get:63 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libbs2b0 amd64 3.1.0+dfsg-7build1 [10.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.4798969Z Get:64 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libflite1 amd64 2.2-6build3 [13.6 MB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.8256112Z Get:65 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libserd-0-0 amd64 0.32.2-1 [43.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.8969745Z Get:66 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libzix-0-0 amd64 0.4.2-2build1 [23.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:31.9682291Z Get:67 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsord-0-0 amd64 0.16.16-2build1 [15.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.0397850Z Get:68 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsratom-0-0 amd64 0.6.16-1build1 [17.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.1111043Z Get:69 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 liblilv-0-0 amd64 0.24.22-1build1 [41.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.1828397Z Get:70 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmysofa1 amd64 1.3.2+dfsg-2ubuntu2 [1158 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.2807918Z Get:71 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libplacebo338 amd64 6.338.2-2build1 [2654 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.4099550Z Get:72 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libblas3 amd64 3.12.0-3build1.1 [238 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.4851696Z Get:73 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 liblapack3 amd64 3.12.0-3build1.1 [2646 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.6136746Z Get:74 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libasyncns0 amd64 0.8-6build4 [11.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.6853532Z Get:75 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libflac12t64 amd64 1.4.3+ds-2.1ubuntu2 [197 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.7604388Z Get:76 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libsndfile1 amd64 1.2.2-1ubuntu5.24.04.1 [209 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.8432045Z Get:77 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libpulse0 amd64 1:16.1+dfsg1-2ubuntu10.1 [292 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.9108262Z Get:78 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsphinxbase3t64 amd64 0.8+5prealpha+1-17build2 [126 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:32.9841454Z Get:79 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libpocketsphinx3 amd64 0.8.0+real5prealpha+1-15ubuntu5 [133 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.0565840Z Get:80 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libpostproc57 amd64 7:6.1.1-3ubuntu5 [49.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.1281460Z Get:81 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libsamplerate0 amd64 0.2.2-4build1 [1344 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.2283973Z Get:82 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 librubberband2 amd64 3.3.0+dfsg-2build1 [130 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.3017277Z Get:83 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libswscale7 amd64 7:6.1.1-3ubuntu5 [193 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.3728382Z Get:84 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libvidstab1.1 amd64 1.1.0-2build1 [38.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.4454538Z Get:85 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libzimg2 amd64 3.0.5+ds1-1build1 [254 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.5205646Z Get:86 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libavfilter9 amd64 7:6.1.1-3ubuntu5 [4235 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.6847482Z Get:87 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 liborc-0.4-0t64 amd64 1:0.4.38-1ubuntu0.1 [207 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.7585884Z Get:88 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libgstreamer-plugins-base1.0-0 amd64 1.24.2-1ubuntu0.3 [862 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.8477802Z Get:89 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 gstreamer1.0-libav amd64 1.24.1-1build1 [103 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:33.9226340Z Get:90 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libcdparanoia0 amd64 3.10.2+debian-14build3 [48.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.0534794Z Get:91 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libvisual-0.4-0 amd64 0.4.2-2build1 [115 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.1238272Z Get:92 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 gstreamer1.0-plugins-base amd64 1.24.2-1ubuntu0.3 [721 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.2072347Z Get:93 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libaa1 amd64 1.4p5-51.1 [49.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.2765224Z Get:94 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libraw1394-11 amd64 2.1.2-2build3 [26.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.3463397Z Get:95 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libavc1394-0 amd64 0.5.4-5build3 [15.4 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.4157822Z Get:96 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libcaca0 amd64 0.99.beta20-4ubuntu0.1 [209 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.4875154Z Get:97 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libdv4t64 amd64 1.0.0-17.1build1 [63.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.5568485Z Get:98 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libgstreamer-plugins-good1.0-0 amd64 1.24.2-1ubuntu1.2 [33.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.6259511Z Get:99 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libiec61883-0 amd64 1.2.0-6build1 [24.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.6956247Z Get:100 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libshout3 amd64 2.4.6-1build2 [50.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.7655520Z Get:101 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libtag1v5-vanilla amd64 1.13.1-1build1 [326 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.8403731Z Get:102 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libtag1v5 amd64 1.13.1-1build1 [11.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.9093777Z Get:103 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libv4lconvert0t64 amd64 1.26.1-4build3 [87.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:34.9775139Z Get:104 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libv4l-0t64 amd64 1.26.1-4build3 [46.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.0432570Z Get:105 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libwavpack1 amd64 5.6.0-1build1 [84.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.1099896Z Get:106 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libsoup-3.0-common all 3.4.4-5ubuntu0.7 [11.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.1756829Z Get:107 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libsoup-3.0-0 amd64 3.4.4-5ubuntu0.7 [292 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.2464770Z Get:108 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 gstreamer1.0-plugins-good amd64 1.24.2-1ubuntu1.2 [2238 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.3602221Z Get:109 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libabsl20220623t64 amd64 20220623.1-3.1ubuntu3.2 [423 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.4339170Z Get:110 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libgav1-1 amd64 0.18.0-1build3 [357 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.5048853Z Get:111 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libyuv0 amd64 0.0~git202401110.af6ac82-1 [178 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.5822376Z Get:112 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libavif16 amd64 1.0.4-1ubuntu3 [91.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.6529987Z Get:113 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libavtp0 amd64 0.2.0-1build1 [6414 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.7185123Z Get:114 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libcairo-script-interpreter2 amd64 1.18.0-3build1 [60.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.7874091Z Get:115 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libdc1394-25 amd64 2.2.6-4build1 [90.1 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.8586409Z Get:116 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libdecor-0-0 amd64 0.2.2-1build2 [16.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.9235631Z Get:117 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libgles2 amd64 1.7.0-1build1 [17.1 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:35.9896161Z Get:118 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libdirectfb-1.7-7t64 amd64 1.7.7-11.1ubuntu2 [1035 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.1314122Z Get:119 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libdvdread8t64 amd64 6.1.3-1.1build1 [54.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.1999374Z Get:120 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libdvdnav4 amd64 6.1.1-3build1 [39.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.2686853Z Get:121 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libegl-mesa0 amd64 25.2.8-0ubuntu0.24.04.1 [117 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.3363264Z Get:122 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libevent-2.1-7t64 amd64 2.1.12-stable-9ubuntu2 [145 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.4037494Z Get:123 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libfaad2 amd64 2.11.1-1build1 [207 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.4708062Z Get:124 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libinstpatch-1.0-2 amd64 1.1.6-1build2 [251 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.5412352Z Get:125 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libjack-jackd2-0 amd64 1.9.21~dfsg-3ubuntu3 [289 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.6101039Z Get:126 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libwebrtc-audio-processing1 amd64 0.3.1-0ubuntu6 [290 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.6788327Z Get:127 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libspa-0.2-modules amd64 1.0.5-1ubuntu3.2 [627 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.7651356Z Get:128 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libpipewire-0.3-0t64 amd64 1.0.5-1ubuntu3.2 [252 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.8338061Z Get:129 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libsdl2-2.0-0 amd64 2.30.0+dfsg-1ubuntu3.1 [686 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:36.9113094Z Get:130 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 timgm6mb-soundfont all 1.3-5 [5427 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.0944403Z Get:131 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libfluidsynth3 amd64 2.3.4-1build3 [249 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.1626012Z Get:132 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libfreeaptx0 amd64 0.1.1-2build1 [13.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.2274998Z Get:133 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libgraphene-1.0-0 amd64 1.10.8-3build2 [46.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.2933085Z Get:134 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libgssdp-1.6-0 amd64 1.6.3-1build3 [40.4 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.3585086Z Get:135 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libegl1 amd64 1.7.0-1build1 [28.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.4246350Z Get:136 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libgstreamer-gl1.0-0 amd64 1.24.2-1ubuntu0.3 [214 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.4923398Z Get:137 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libgtk-4-common all 4.14.5+ds-0ubuntu0.7 [1496 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.5857879Z Get:138 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libgtk-4-1 amd64 4.14.5+ds-0ubuntu0.7 [3294 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.7219954Z Get:139 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libgupnp-1.6-0 amd64 1.6.6-1build3 [92.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.7923188Z Get:140 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libgupnp-igd-1.6-0 amd64 1.6.0-3build3 [16.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.8619778Z Get:141 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libharfbuzz-icu0 amd64 8.3.0-2build2 [13.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:37.9315669Z Get:142 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libhyphen0 amd64 2.8.8-7build3 [26.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.0031199Z Get:143 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libimath-3-1-29t64 amd64 3.1.9-3.1ubuntu2 [72.2 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.0750942Z Get:144 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 liblc3-1 amd64 1.0.4-3build1 [69.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.1460008Z Get:145 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libldacbt-enc2 amd64 2.0.2.3+git20200429+ed310a0-4ubuntu2 [27.1 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.2116808Z Get:146 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libxslt1.1 amd64 1.1.39-0exp1ubuntu0.24.04.3 [168 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.2833370Z Get:147 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libraptor2-0 amd64 2.0.16-3ubuntu0.1 [165 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.3542399Z Get:148 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 liblrdf0 amd64 0.6.1-4build1 [18.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.4200141Z Get:149 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libltc11 amd64 1.3.2-1build1 [13.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.4857503Z Get:150 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libmanette-0.2-0 amd64 0.2.7-1build2 [30.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.5509711Z Get:151 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmfx1 amd64 22.5.4-1 [3124 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.6491373Z Get:152 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmjpegutils-2.1-0t64 amd64 1:2.1.0+debian-8.1build1 [25.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.7187975Z Get:153 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmodplug1 amd64 1:0.8.9.0-3build1 [166 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.7949805Z Get:154 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmpcdec6 amd64 2:0.1~r495-2build1 [32.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.8641019Z Get:155 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmpeg2encpp-2.1-0t64 amd64 1:2.1.0+debian-8.1build1 [75.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:38.9339994Z Get:156 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libmplex2-2.1-0t64 amd64 1:2.1.0+debian-8.1build1 [46.1 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.0078621Z Get:157 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libneon27t64 amd64 0.33.0-1.1build3 [102 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.0806707Z Get:158 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libnice10 amd64 0.1.21-2build3 [157 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.1514700Z Get:159 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libopenal-data all 1:1.23.1-4build1 [161 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.2222309Z Get:160 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libopenexr-3-1-30 amd64 3.1.5-5.1build3 [1004 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.3047553Z Get:161 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libopenh264-7 amd64 2.4.1+dfsg-1 [409 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.3783546Z Get:162 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libopenni2-0 amd64 2.2.0.33+dfsg-18 [370 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.4513483Z Get:163 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libqrencode4 amd64 4.1.1-1build2 [25.0 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.5170180Z Get:164 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libsecret-common all 0.21.4-1build3 [4962 B]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.5826164Z Get:165 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libsecret-1-0 amd64 0.21.4-1build3 [116 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.6498425Z Get:166 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsndio7.0 amd64 1.9.0-0.3build3 [29.6 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.7154350Z Get:167 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsoundtouch1 amd64 2.3.2+ds1-1build1 [60.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.7807156Z Get:168 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libspandsp2t64 amd64 0.0.6+dfsg-2.1build1 [311 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.8505764Z Get:169 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libsrtp2-1 amd64 2.5.0-3build1 [41.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.9181028Z Get:170 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libssh-4 amd64 0.10.6-2ubuntu0.2 [188 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:39.9879322Z Get:171 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libwayland-server0 amd64 1.22.0-2.1build1 [33.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.0533364Z Get:172 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libwildmidi2 amd64 0.4.3-1build3 [68.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.1212002Z Get:173 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libwoff1 amd64 1.0.2-2build1 [45.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.1873534Z Get:174 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libxcb-xkb1 amd64 1.15-1ubuntu2 [32.3 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.2527776Z Get:175 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libxkbcommon-x11-0 amd64 1.6.0-1build1 [14.5 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.3193204Z Get:176 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libzbar0t64 amd64 0.23.93-4build3 [123 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.3866434Z Get:177 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libzxing3 amd64 2.2.1-3 [583 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.4667667Z Get:178 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 xfonts-encodings all 1:1.0.5-0ubuntu2 [578 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.5418675Z Get:179 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 xfonts-utils amd64 1:7.7+6build3 [94.4 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.6092087Z Get:180 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 xfonts-cyrillic all 1:1.0.5+nmu1 [384 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.6803716Z Get:181 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 xfonts-scalable all 1:1.0.3-1.3 [304 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.7507575Z Get:182 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libgstreamer-plugins-bad1.0-0 amd64 1.24.2-1ubuntu4 [797 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.8384321Z Get:183 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libdca0 amd64 0.0.7-2build1 [93.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.9052569Z Get:184 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libopenal1 amd64 1:1.23.1-4build1 [540 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:40.9800743Z Get:185 http://azure.archive.ubuntu.com/ubuntu noble/main amd64 libsbc1 amd64 2.0-1build1 [33.9 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.0450819Z Get:186 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libvo-aacenc0 amd64 0.1.3-2build1 [67.8 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.1186422Z Get:187 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 libvo-amrwbenc0 amd64 0.1.3-2build1 [76.7 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.2002149Z Get:188 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 gstreamer1.0-plugins-bad amd64 1.24.2-1ubuntu4 [3081 kB]
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.8893292Z Fetched 116 MB in 15s (7585 kB/s)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9361514Z Selecting previously unselected package fonts-ipafont-gothic.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9712718Z (Reading database ... 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9713168Z (Reading database ... 5%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9713622Z (Reading database ... 10%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9713944Z (Reading database ... 15%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9714222Z (Reading database ... 20%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9714488Z (Reading database ... 25%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9714766Z (Reading database ... 30%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9715031Z (Reading database ... 35%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9715302Z (Reading database ... 40%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9715559Z (Reading database ... 45%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9715914Z (Reading database ... 50%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:41.9813530Z (Reading database ... 55%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.1187716Z (Reading database ... 60%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.2877176Z (Reading database ... 65%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.3370937Z (Reading database ... 70%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.4251273Z (Reading database ... 75%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.6331667Z (Reading database ... 80%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.8110977Z (Reading database ... 85%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:42.9702172Z (Reading database ... 90%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.1330692Z (Reading database ... 95%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.1331158Z (Reading database ... 100%
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.1331820Z (Reading database ... 217745 files and directories currently installed.)
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.1377146Z Preparing to unpack .../000-fonts-ipafont-gothic_00303-21ubuntu1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.1474604Z Unpacking fonts-ipafont-gothic (00303-21ubuntu1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.3991314Z Preparing to unpack .../001-libglib2.0-data_2.80.0-6ubuntu3.8_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.4021063Z Unpacking libglib2.0-data (2.80.0-6ubuntu3.8) over (2.80.0-6ubuntu3.4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.4389934Z Preparing to unpack .../002-libglib2.0-bin_2.80.0-6ubuntu3.8_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.4419420Z Unpacking libglib2.0-bin (2.80.0-6ubuntu3.8) over (2.80.0-6ubuntu3.4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.5126936Z Preparing to unpack .../003-gir1.2-glib-2.0_2.80.0-6ubuntu3.8_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.5155009Z Unpacking gir1.2-glib-2.0:amd64 (2.80.0-6ubuntu3.8) over (2.80.0-6ubuntu3.4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.5585423Z Preparing to unpack .../004-libglib2.0-0t64_2.80.0-6ubuntu3.8_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.5665621Z Unpacking libglib2.0-0t64:amd64 (2.80.0-6ubuntu3.8) over (2.80.0-6ubuntu3.4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.6289432Z Preparing to unpack .../005-libpng16-16t64_1.6.43-5ubuntu0.4_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.6363786Z Unpacking libpng16-16t64:amd64 (1.6.43-5ubuntu0.4) over (1.6.43-5build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.6639962Z Selecting previously unselected package fonts-freefont-ttf.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.6773429Z Preparing to unpack .../006-fonts-freefont-ttf_20211204+svn4273-2_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.6784039Z Unpacking fonts-freefont-ttf (20211204+svn4273-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.7658139Z Selecting previously unselected package fonts-tlwg-loma-otf.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.7794183Z Preparing to unpack .../007-fonts-tlwg-loma-otf_1%3a0.7.3-1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.7806173Z Unpacking fonts-tlwg-loma-otf (1:0.7.3-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.8038748Z Selecting previously unselected package fonts-unifont.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.8171990Z Preparing to unpack .../008-fonts-unifont_1%3a15.1.01-1build1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.8184506Z Unpacking fonts-unifont (1:15.1.01-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.9419962Z Selecting previously unselected package fonts-wqy-zenhei.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.9556398Z Preparing to unpack .../009-fonts-wqy-zenhei_0.9.45-8_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:43.9664251Z Unpacking fonts-wqy-zenhei (0.9.45-8) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.4302873Z Selecting previously unselected package libproxy1v5:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.4438141Z Preparing to unpack .../010-libproxy1v5_0.5.4-4build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.4449868Z Unpacking libproxy1v5:amd64 (0.5.4-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.4676153Z Selecting previously unselected package glib-networking-common.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.4812257Z Preparing to unpack .../011-glib-networking-common_2.80.0-1build1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.4822017Z Unpacking glib-networking-common (2.80.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5032748Z Selecting previously unselected package glib-networking-services.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5172877Z Preparing to unpack .../012-glib-networking-services_2.80.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5182965Z Unpacking glib-networking-services (2.80.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5408040Z Selecting previously unselected package session-migration.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5545968Z Preparing to unpack .../013-session-migration_0.3.9build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5556212Z Unpacking session-migration (0.3.9build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5812995Z Selecting previously unselected package gsettings-desktop-schemas.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5945519Z Preparing to unpack .../014-gsettings-desktop-schemas_46.1-0ubuntu1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.5958248Z Unpacking gsettings-desktop-schemas (46.1-0ubuntu1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6244662Z Selecting previously unselected package glib-networking:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6378797Z Preparing to unpack .../015-glib-networking_2.80.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6387924Z Unpacking glib-networking:amd64 (2.80.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6621312Z Selecting previously unselected package libva2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6756154Z Preparing to unpack .../016-libva2_2.20.0-2ubuntu0.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6767636Z Unpacking libva2:amd64 (2.20.0-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.6995708Z Selecting previously unselected package libva-drm2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7128110Z Preparing to unpack .../017-libva-drm2_2.20.0-2ubuntu0.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7138525Z Unpacking libva-drm2:amd64 (2.20.0-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7359441Z Selecting previously unselected package libva-x11-2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7489493Z Preparing to unpack .../018-libva-x11-2_2.20.0-2ubuntu0.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7499314Z Unpacking libva-x11-2:amd64 (2.20.0-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7729965Z Selecting previously unselected package libvdpau1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7861335Z Preparing to unpack .../019-libvdpau1_1.5-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.7875181Z Unpacking libvdpau1:amd64 (1.5-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8101719Z Selecting previously unselected package libvpl2.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8229544Z Preparing to unpack .../020-libvpl2_2023.3.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8239825Z Unpacking libvpl2 (2023.3.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8477011Z Selecting previously unselected package ocl-icd-libopencl1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8604303Z Preparing to unpack .../021-ocl-icd-libopencl1_2.3.2-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8614035Z Unpacking ocl-icd-libopencl1:amd64 (2.3.2-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.8873324Z Selecting previously unselected package libavutil58:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.9004700Z Preparing to unpack .../022-libavutil58_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.9016143Z Unpacking libavutil58:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.9301955Z Selecting previously unselected package libcodec2-1.2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.9433769Z Preparing to unpack .../023-libcodec2-1.2_1.2.0-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:44.9443779Z Unpacking libcodec2-1.2:amd64 (1.2.0-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.0290931Z Selecting previously unselected package libdav1d7:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.0427493Z Preparing to unpack .../024-libdav1d7_1.4.1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.0438336Z Unpacking libdav1d7:amd64 (1.4.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.0748675Z Selecting previously unselected package libgsm1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.0885250Z Preparing to unpack .../025-libgsm1_1.0.22-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.0895998Z Unpacking libgsm1:amd64 (1.0.22-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.1121437Z Selecting previously unselected package libhwy1t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.1256078Z Preparing to unpack .../026-libhwy1t64_1.0.7-8.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.1266334Z Unpacking libhwy1t64:amd64 (1.0.7-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.1631736Z Selecting previously unselected package libjxl0.7:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.1765243Z Preparing to unpack .../027-libjxl0.7_0.7.0-10.2ubuntu6.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.1776143Z Unpacking libjxl0.7:amd64 (0.7.0-10.2ubuntu6.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2148990Z Selecting previously unselected package libmp3lame0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2283296Z Preparing to unpack .../028-libmp3lame0_3.100-6build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2293689Z Unpacking libmp3lame0:amd64 (3.100-6build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2531503Z Selecting previously unselected package libopus0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2663079Z Preparing to unpack .../029-libopus0_1.4-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2675020Z Unpacking libopus0:amd64 (1.4-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.2907597Z Selecting previously unselected package librav1e0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.3039976Z Preparing to unpack .../030-librav1e0_0.7.1-2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.3050862Z Unpacking librav1e0:amd64 (0.7.1-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.3409578Z Selecting previously unselected package librsvg2-2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.3541703Z Preparing to unpack .../031-librsvg2-2_2.58.0+dfsg-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.3553368Z Unpacking librsvg2-2:amd64 (2.58.0+dfsg-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4065029Z Selecting previously unselected package libshine3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4198100Z Preparing to unpack .../032-libshine3_3.1.1-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4208645Z Unpacking libshine3:amd64 (3.1.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4420935Z Selecting previously unselected package libspeex1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4553889Z Preparing to unpack .../033-libspeex1_1.2.1-2ubuntu2.24.04.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4570948Z Unpacking libspeex1:amd64 (1.2.1-2ubuntu2.24.04.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4790115Z Selecting previously unselected package libsvtav1enc1d1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4921031Z Preparing to unpack .../034-libsvtav1enc1d1_1.7.0+dfsg-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.4932321Z Unpacking libsvtav1enc1d1:amd64 (1.7.0+dfsg-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.5451208Z Selecting previously unselected package libsoxr0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.5587016Z Preparing to unpack .../035-libsoxr0_0.1.3-4build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.5597579Z Unpacking libsoxr0:amd64 (0.1.3-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.5837121Z Selecting previously unselected package libswresample4:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.5967033Z Preparing to unpack .../036-libswresample4_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.5977778Z Unpacking libswresample4:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.6217178Z Selecting previously unselected package libtheora0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.6354207Z Preparing to unpack .../037-libtheora0_1.1.1+dfsg.1-16.1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.6364881Z Unpacking libtheora0:amd64 (1.1.1+dfsg.1-16.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.6642753Z Selecting previously unselected package libtwolame0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.6773710Z Preparing to unpack .../038-libtwolame0_0.4.0-2build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.6787395Z Unpacking libtwolame0:amd64 (0.4.0-2build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7021571Z Selecting previously unselected package libvorbisenc2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7152116Z Preparing to unpack .../039-libvorbisenc2_1.3.7-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7163824Z Unpacking libvorbisenc2:amd64 (1.3.7-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7408111Z Selecting previously unselected package libvpx9:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7536867Z Preparing to unpack .../040-libvpx9_1.14.0-1ubuntu2.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7547779Z Unpacking libvpx9:amd64 (1.14.0-1ubuntu2.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.7933056Z Selecting previously unselected package libx264-164:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.8063184Z Preparing to unpack .../041-libx264-164_2%3a0.164.3108+git31e19f9-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.8074185Z Unpacking libx264-164:amd64 (2:0.164.3108+git31e19f9-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.8368981Z Selecting previously unselected package libx265-199:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.8498688Z Preparing to unpack .../042-libx265-199_3.5-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.8510069Z Unpacking libx265-199:amd64 (3.5-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.9279837Z Selecting previously unselected package libxvidcore4:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.9413866Z Preparing to unpack .../043-libxvidcore4_2%3a1.3.7-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.9425186Z Unpacking libxvidcore4:amd64 (2:1.3.7-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.9654819Z Selecting previously unselected package libzvbi-common.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.9788169Z Preparing to unpack .../044-libzvbi-common_0.2.42-2_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:45.9798509Z Unpacking libzvbi-common (0.2.42-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.0238998Z Selecting previously unselected package libzvbi0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.0371000Z Preparing to unpack .../045-libzvbi0t64_0.2.42-2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.0383960Z Unpacking libzvbi0t64:amd64 (0.2.42-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.0670886Z Selecting previously unselected package libavcodec60:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.0805740Z Preparing to unpack .../046-libavcodec60_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.0813982Z Unpacking libavcodec60:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.1710908Z Selecting previously unselected package libunibreak5:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.1848257Z Preparing to unpack .../047-libunibreak5_5.1-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.1869411Z Unpacking libunibreak5:amd64 (5.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2079795Z Selecting previously unselected package libass9:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2215134Z Preparing to unpack .../048-libass9_1%3a0.17.1-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2224235Z Unpacking libass9:amd64 (1:0.17.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2453942Z Selecting previously unselected package libudfread0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2588677Z Preparing to unpack .../049-libudfread0_1.1.2-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2597124Z Unpacking libudfread0:amd64 (1.1.2-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2809913Z Selecting previously unselected package libbluray2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2977474Z Preparing to unpack .../050-libbluray2_1%3a1.3.4-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.2992059Z Unpacking libbluray2:amd64 (1:1.3.4-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.3339548Z Selecting previously unselected package libchromaprint1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.3478823Z Preparing to unpack .../051-libchromaprint1_1.5.1-5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.3487564Z Unpacking libchromaprint1:amd64 (1.5.1-5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.3702357Z Selecting previously unselected package libgme0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.3853370Z Preparing to unpack .../052-libgme0_0.6.3-7build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.3862412Z Unpacking libgme0:amd64 (0.6.3-7build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4093484Z Selecting previously unselected package libmpg123-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4227515Z Preparing to unpack .../053-libmpg123-0t64_1.32.5-1ubuntu1.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4235727Z Unpacking libmpg123-0t64:amd64 (1.32.5-1ubuntu1.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4486323Z Selecting previously unselected package libopenmpt0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4620100Z Preparing to unpack .../054-libopenmpt0t64_0.7.3-1.1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4629356Z Unpacking libopenmpt0t64:amd64 (0.7.3-1.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.4910137Z Selecting previously unselected package libcjson1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5044949Z Preparing to unpack .../055-libcjson1_1.7.17-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5054432Z Unpacking libcjson1:amd64 (1.7.17-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5264646Z Selecting previously unselected package libmbedcrypto7t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5398220Z Preparing to unpack .../056-libmbedcrypto7t64_2.28.8-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5427806Z Unpacking libmbedcrypto7t64:amd64 (2.28.8-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5662442Z Selecting previously unselected package librist4:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5797424Z Preparing to unpack .../057-librist4_0.2.10+dfsg-2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.5805587Z Unpacking librist4:amd64 (0.2.10+dfsg-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6017435Z Selecting previously unselected package libsrt1.5-gnutls:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6151211Z Preparing to unpack .../058-libsrt1.5-gnutls_1.5.3-1build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6159224Z Unpacking libsrt1.5-gnutls:amd64 (1.5.3-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6405718Z Selecting previously unselected package libssh-gcrypt-4:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6543470Z Preparing to unpack .../059-libssh-gcrypt-4_0.10.6-2ubuntu0.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6552423Z Unpacking libssh-gcrypt-4:amd64 (0.10.6-2ubuntu0.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6792796Z Selecting previously unselected package libavformat60:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6927973Z Preparing to unpack .../060-libavformat60_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.6936211Z Unpacking libavformat60:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.7287045Z Selecting previously unselected package libbs2b0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.7422346Z Preparing to unpack .../061-libbs2b0_3.1.0+dfsg-7build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.7430674Z Unpacking libbs2b0:amd64 (3.1.0+dfsg-7build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.7686912Z Selecting previously unselected package libflite1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.7822073Z Preparing to unpack .../062-libflite1_2.2-6build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.7831476Z Unpacking libflite1:amd64 (2.2-6build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9034786Z Selecting previously unselected package libserd-0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9168299Z Preparing to unpack .../063-libserd-0-0_0.32.2-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9177043Z Unpacking libserd-0-0:amd64 (0.32.2-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9388867Z Selecting previously unselected package libzix-0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9523054Z Preparing to unpack .../064-libzix-0-0_0.4.2-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9532286Z Unpacking libzix-0-0:amd64 (0.4.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9733638Z Selecting previously unselected package libsord-0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9866350Z Preparing to unpack .../065-libsord-0-0_0.16.16-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:46.9874649Z Unpacking libsord-0-0:amd64 (0.16.16-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0106185Z Selecting previously unselected package libsratom-0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0234504Z Preparing to unpack .../066-libsratom-0-0_0.6.16-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0242704Z Unpacking libsratom-0-0:amd64 (0.6.16-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0442705Z Selecting previously unselected package liblilv-0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0570627Z Preparing to unpack .../067-liblilv-0-0_0.24.22-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0579075Z Unpacking liblilv-0-0:amd64 (0.24.22-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0789897Z Selecting previously unselected package libmysofa1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0917147Z Preparing to unpack .../068-libmysofa1_1.3.2+dfsg-2ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.0942721Z Unpacking libmysofa1:amd64 (1.3.2+dfsg-2ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.1203769Z Selecting previously unselected package libplacebo338:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.1334081Z Preparing to unpack .../069-libplacebo338_6.338.2-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.1342347Z Unpacking libplacebo338:amd64 (6.338.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.1964475Z Selecting previously unselected package libblas3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.2100082Z Preparing to unpack .../070-libblas3_3.12.0-3build1.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.2132208Z Unpacking libblas3:amd64 (3.12.0-3build1.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.2379944Z Selecting previously unselected package liblapack3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.2514529Z Preparing to unpack .../071-liblapack3_3.12.0-3build1.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.2547545Z Unpacking liblapack3:amd64 (3.12.0-3build1.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3072466Z Selecting previously unselected package libasyncns0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3222713Z Preparing to unpack .../072-libasyncns0_0.8-6build4_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3240246Z Unpacking libasyncns0:amd64 (0.8-6build4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3443819Z Selecting previously unselected package libflac12t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3575825Z Preparing to unpack .../073-libflac12t64_1.4.3+ds-2.1ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3585374Z Unpacking libflac12t64:amd64 (1.4.3+ds-2.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3814986Z Selecting previously unselected package libsndfile1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3947776Z Preparing to unpack .../074-libsndfile1_1.2.2-1ubuntu5.24.04.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.3955840Z Unpacking libsndfile1:amd64 (1.2.2-1ubuntu5.24.04.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.4207500Z Selecting previously unselected package libpulse0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.4339834Z Preparing to unpack .../075-libpulse0_1%3a16.1+dfsg1-2ubuntu10.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.4404347Z Unpacking libpulse0:amd64 (1:16.1+dfsg1-2ubuntu10.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.4677141Z Selecting previously unselected package libsphinxbase3t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.4812776Z Preparing to unpack .../076-libsphinxbase3t64_0.8+5prealpha+1-17build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.4821463Z Unpacking libsphinxbase3t64:amd64 (0.8+5prealpha+1-17build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5057049Z Selecting previously unselected package libpocketsphinx3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5191202Z Preparing to unpack .../077-libpocketsphinx3_0.8.0+real5prealpha+1-15ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5199881Z Unpacking libpocketsphinx3:amd64 (0.8.0+real5prealpha+1-15ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5573766Z Selecting previously unselected package libpostproc57:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5705984Z Preparing to unpack .../078-libpostproc57_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5714036Z Unpacking libpostproc57:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.5924050Z Selecting previously unselected package libsamplerate0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6055907Z Preparing to unpack .../079-libsamplerate0_0.2.2-4build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6064637Z Unpacking libsamplerate0:amd64 (0.2.2-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6344146Z Selecting previously unselected package librubberband2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6480059Z Preparing to unpack .../080-librubberband2_3.3.0+dfsg-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6488615Z Unpacking librubberband2:amd64 (3.3.0+dfsg-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6726247Z Selecting previously unselected package libswscale7:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6861736Z Preparing to unpack .../081-libswscale7_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.6869819Z Unpacking libswscale7:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7109385Z Selecting previously unselected package libvidstab1.1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7244689Z Preparing to unpack .../082-libvidstab1.1_1.1.0-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7252461Z Unpacking libvidstab1.1:amd64 (1.1.0-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7459663Z Selecting previously unselected package libzimg2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7593499Z Preparing to unpack .../083-libzimg2_3.0.5+ds1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7601532Z Unpacking libzimg2:amd64 (3.0.5+ds1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7854446Z Selecting previously unselected package libavfilter9:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7991961Z Preparing to unpack .../084-libavfilter9_7%3a6.1.1-3ubuntu5_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.7999991Z Unpacking libavfilter9:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.8737552Z Selecting previously unselected package liborc-0.4-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.8876490Z Preparing to unpack .../085-liborc-0.4-0t64_1%3a0.4.38-1ubuntu0.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.8884809Z Unpacking liborc-0.4-0t64:amd64 (1:0.4.38-1ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9137914Z Selecting previously unselected package libgstreamer-plugins-base1.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9275041Z Preparing to unpack .../086-libgstreamer-plugins-base1.0-0_1.24.2-1ubuntu0.3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9285428Z Unpacking libgstreamer-plugins-base1.0-0:amd64 (1.24.2-1ubuntu0.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9619497Z Selecting previously unselected package gstreamer1.0-libav:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9759953Z Preparing to unpack .../087-gstreamer1.0-libav_1.24.1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9782426Z Unpacking gstreamer1.0-libav:amd64 (1.24.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:47.9994841Z Selecting previously unselected package libcdparanoia0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0127453Z Preparing to unpack .../088-libcdparanoia0_3.10.2+debian-14build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0135123Z Unpacking libcdparanoia0:amd64 (3.10.2+debian-14build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0349898Z Selecting previously unselected package libvisual-0.4-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0481438Z Preparing to unpack .../089-libvisual-0.4-0_0.4.2-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0489575Z Unpacking libvisual-0.4-0:amd64 (0.4.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0715147Z Selecting previously unselected package gstreamer1.0-plugins-base:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0857947Z Preparing to unpack .../090-gstreamer1.0-plugins-base_1.24.2-1ubuntu0.3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.0885210Z Unpacking gstreamer1.0-plugins-base:amd64 (1.24.2-1ubuntu0.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1226873Z Selecting previously unselected package libaa1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1362925Z Preparing to unpack .../091-libaa1_1.4p5-51.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1370310Z Unpacking libaa1:amd64 (1.4p5-51.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1585778Z Selecting previously unselected package libraw1394-11:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1720222Z Preparing to unpack .../092-libraw1394-11_2.1.2-2build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1728249Z Unpacking libraw1394-11:amd64 (2.1.2-2build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.1940224Z Selecting previously unselected package libavc1394-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2074759Z Preparing to unpack .../093-libavc1394-0_0.5.4-5build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2083060Z Unpacking libavc1394-0:amd64 (0.5.4-5build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2292354Z Selecting previously unselected package libcaca0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2424526Z Preparing to unpack .../094-libcaca0_0.99.beta20-4ubuntu0.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2433399Z Unpacking libcaca0:amd64 (0.99.beta20-4ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2675292Z Selecting previously unselected package libdv4t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2807137Z Preparing to unpack .../095-libdv4t64_1.0.0-17.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.2815898Z Unpacking libdv4t64:amd64 (1.0.0-17.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3038512Z Selecting previously unselected package libgstreamer-plugins-good1.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3169600Z Preparing to unpack .../096-libgstreamer-plugins-good1.0-0_1.24.2-1ubuntu1.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3179670Z Unpacking libgstreamer-plugins-good1.0-0:amd64 (1.24.2-1ubuntu1.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3391190Z Selecting previously unselected package libiec61883-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3521052Z Preparing to unpack .../097-libiec61883-0_1.2.0-6build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3529087Z Unpacking libiec61883-0:amd64 (1.2.0-6build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3737549Z Selecting previously unselected package libshout3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3881771Z Preparing to unpack .../098-libshout3_2.4.6-1build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.3889852Z Unpacking libshout3:amd64 (2.4.6-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4102652Z Selecting previously unselected package libtag1v5-vanilla:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4231310Z Preparing to unpack .../099-libtag1v5-vanilla_1.13.1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4239965Z Unpacking libtag1v5-vanilla:amd64 (1.13.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4472230Z Selecting previously unselected package libtag1v5:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4599859Z Preparing to unpack .../100-libtag1v5_1.13.1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4607754Z Unpacking libtag1v5:amd64 (1.13.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4806347Z Selecting previously unselected package libv4lconvert0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4932279Z Preparing to unpack .../101-libv4lconvert0t64_1.26.1-4build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.4940313Z Unpacking libv4lconvert0t64:amd64 (1.26.1-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5161079Z Selecting previously unselected package libv4l-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5287115Z Preparing to unpack .../102-libv4l-0t64_1.26.1-4build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5314479Z Unpacking libv4l-0t64:amd64 (1.26.1-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5539552Z Selecting previously unselected package libwavpack1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5665002Z Preparing to unpack .../103-libwavpack1_5.6.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5672591Z Unpacking libwavpack1:amd64 (5.6.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.5875171Z Selecting previously unselected package libsoup-3.0-common.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6002901Z Preparing to unpack .../104-libsoup-3.0-common_3.4.4-5ubuntu0.7_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6010710Z Unpacking libsoup-3.0-common (3.4.4-5ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6207901Z Selecting previously unselected package libsoup-3.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6335786Z Preparing to unpack .../105-libsoup-3.0-0_3.4.4-5ubuntu0.7_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6343347Z Unpacking libsoup-3.0-0:amd64 (3.4.4-5ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6587376Z Selecting previously unselected package gstreamer1.0-plugins-good:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6713889Z Preparing to unpack .../106-gstreamer1.0-plugins-good_1.24.2-1ubuntu1.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.6723640Z Unpacking gstreamer1.0-plugins-good:amd64 (1.24.2-1ubuntu1.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.7324451Z Selecting previously unselected package libabsl20220623t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.7459816Z Preparing to unpack .../107-libabsl20220623t64_20220623.1-3.1ubuntu3.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.7467153Z Unpacking libabsl20220623t64:amd64 (20220623.1-3.1ubuntu3.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.7893804Z Selecting previously unselected package libgav1-1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8029358Z Preparing to unpack .../108-libgav1-1_0.18.0-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8037498Z Unpacking libgav1-1:amd64 (0.18.0-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8282115Z Selecting previously unselected package libyuv0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8415620Z Preparing to unpack .../109-libyuv0_0.0~git202401110.af6ac82-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8423524Z Unpacking libyuv0:amd64 (0.0~git202401110.af6ac82-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8653206Z Selecting previously unselected package libavif16:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8784164Z Preparing to unpack .../110-libavif16_1.0.4-1ubuntu3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.8792058Z Unpacking libavif16:amd64 (1.0.4-1ubuntu3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9007706Z Selecting previously unselected package libavtp0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9139466Z Preparing to unpack .../111-libavtp0_0.2.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9146734Z Unpacking libavtp0:amd64 (0.2.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9353545Z Selecting previously unselected package libcairo-script-interpreter2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9483662Z Preparing to unpack .../112-libcairo-script-interpreter2_1.18.0-3build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9491235Z Unpacking libcairo-script-interpreter2:amd64 (1.18.0-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9699741Z Selecting previously unselected package libdc1394-25:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9839266Z Preparing to unpack .../113-libdc1394-25_2.2.6-4build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:48.9847656Z Unpacking libdc1394-25:amd64 (2.2.6-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0062669Z Selecting previously unselected package libdecor-0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0191840Z Preparing to unpack .../114-libdecor-0-0_0.2.2-1build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0199168Z Unpacking libdecor-0-0:amd64 (0.2.2-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0405323Z Selecting previously unselected package libgles2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0532729Z Preparing to unpack .../115-libgles2_1.7.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0540565Z Unpacking libgles2:amd64 (1.7.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0747619Z Selecting previously unselected package libdirectfb-1.7-7t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0875451Z Preparing to unpack .../116-libdirectfb-1.7-7t64_1.7.7-11.1ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.0884194Z Unpacking libdirectfb-1.7-7t64:amd64 (1.7.7-11.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.1315617Z Selecting previously unselected package libdvdread8t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.1447541Z Preparing to unpack .../117-libdvdread8t64_6.1.3-1.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.1456080Z Unpacking libdvdread8t64:amd64 (6.1.3-1.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.1672124Z Selecting previously unselected package libdvdnav4:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.1802978Z Preparing to unpack .../118-libdvdnav4_6.1.1-3build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.1812637Z Unpacking libdvdnav4:amd64 (6.1.1-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2073484Z Selecting previously unselected package libegl-mesa0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2202545Z Preparing to unpack .../119-libegl-mesa0_25.2.8-0ubuntu0.24.04.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2210280Z Unpacking libegl-mesa0:amd64 (25.2.8-0ubuntu0.24.04.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2439201Z Selecting previously unselected package libevent-2.1-7t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2567770Z Preparing to unpack .../120-libevent-2.1-7t64_2.1.12-stable-9ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2576107Z Unpacking libevent-2.1-7t64:amd64 (2.1.12-stable-9ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2794349Z Selecting previously unselected package libfaad2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2922824Z Preparing to unpack .../121-libfaad2_2.11.1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.2930097Z Unpacking libfaad2:amd64 (2.11.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3195187Z Selecting previously unselected package libinstpatch-1.0-2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3323052Z Preparing to unpack .../122-libinstpatch-1.0-2_1.1.6-1build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3330998Z Unpacking libinstpatch-1.0-2:amd64 (1.1.6-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3567483Z Selecting previously unselected package libjack-jackd2-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3696862Z Preparing to unpack .../123-libjack-jackd2-0_1.9.21~dfsg-3ubuntu3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3704986Z Unpacking libjack-jackd2-0:amd64 (1.9.21~dfsg-3ubuntu3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.3957967Z Selecting previously unselected package libwebrtc-audio-processing1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4086571Z Preparing to unpack .../124-libwebrtc-audio-processing1_0.3.1-0ubuntu6_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4095945Z Unpacking libwebrtc-audio-processing1:amd64 (0.3.1-0ubuntu6) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4322967Z Selecting previously unselected package libspa-0.2-modules:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4450170Z Preparing to unpack .../125-libspa-0.2-modules_1.0.5-1ubuntu3.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4458225Z Unpacking libspa-0.2-modules:amd64 (1.0.5-1ubuntu3.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4783928Z Selecting previously unselected package libpipewire-0.3-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4912638Z Preparing to unpack .../126-libpipewire-0.3-0t64_1.0.5-1ubuntu3.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.4921114Z Unpacking libpipewire-0.3-0t64:amd64 (1.0.5-1ubuntu3.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.5163505Z Selecting previously unselected package libsdl2-2.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.5294982Z Preparing to unpack .../127-libsdl2-2.0-0_2.30.0+dfsg-1ubuntu3.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.5303329Z Unpacking libsdl2-2.0-0:amd64 (2.30.0+dfsg-1ubuntu3.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.5595066Z Selecting previously unselected package timgm6mb-soundfont.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.5723335Z Preparing to unpack .../128-timgm6mb-soundfont_1.3-5_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.5731589Z Unpacking timgm6mb-soundfont (1.3-5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9182638Z Selecting previously unselected package libfluidsynth3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9323463Z Preparing to unpack .../129-libfluidsynth3_2.3.4-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9332660Z Unpacking libfluidsynth3:amd64 (2.3.4-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9577305Z Selecting previously unselected package libfreeaptx0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9747365Z Preparing to unpack .../130-libfreeaptx0_0.1.1-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9756262Z Unpacking libfreeaptx0:amd64 (0.1.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:49.9990084Z Selecting previously unselected package libgraphene-1.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0131864Z Preparing to unpack .../131-libgraphene-1.0-0_1.10.8-3build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0141290Z Unpacking libgraphene-1.0-0:amd64 (1.10.8-3build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0373873Z Selecting previously unselected package libgssdp-1.6-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0511944Z Preparing to unpack .../132-libgssdp-1.6-0_1.6.3-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0520870Z Unpacking libgssdp-1.6-0:amd64 (1.6.3-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0768497Z Selecting previously unselected package libegl1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0905038Z Preparing to unpack .../133-libegl1_1.7.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.0913404Z Unpacking libegl1:amd64 (1.7.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.1135811Z Selecting previously unselected package libgstreamer-gl1.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.1275963Z Preparing to unpack .../134-libgstreamer-gl1.0-0_1.24.2-1ubuntu0.3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.1284257Z Unpacking libgstreamer-gl1.0-0:amd64 (1.24.2-1ubuntu0.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.1519539Z Selecting previously unselected package libgtk-4-common.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.1655932Z Preparing to unpack .../135-libgtk-4-common_4.14.5+ds-0ubuntu0.7_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.1673962Z Unpacking libgtk-4-common (4.14.5+ds-0ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.2193351Z Selecting previously unselected package libgtk-4-1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.2329299Z Preparing to unpack .../136-libgtk-4-1_4.14.5+ds-0ubuntu0.7_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.2337083Z Unpacking libgtk-4-1:amd64 (4.14.5+ds-0ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3065660Z Selecting previously unselected package libgupnp-1.6-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3201641Z Preparing to unpack .../137-libgupnp-1.6-0_1.6.6-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3209815Z Unpacking libgupnp-1.6-0:amd64 (1.6.6-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3435760Z Selecting previously unselected package libgupnp-igd-1.6-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3572300Z Preparing to unpack .../138-libgupnp-igd-1.6-0_1.6.0-3build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3580692Z Unpacking libgupnp-igd-1.6-0:amd64 (1.6.0-3build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3794688Z Selecting previously unselected package libharfbuzz-icu0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3929174Z Preparing to unpack .../139-libharfbuzz-icu0_8.3.0-2build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.3937594Z Unpacking libharfbuzz-icu0:amd64 (8.3.0-2build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4183795Z Selecting previously unselected package libhyphen0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4317732Z Preparing to unpack .../140-libhyphen0_2.8.8-7build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4325489Z Unpacking libhyphen0:amd64 (2.8.8-7build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4539333Z Selecting previously unselected package libimath-3-1-29t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4671781Z Preparing to unpack .../141-libimath-3-1-29t64_3.1.9-3.1ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4682057Z Unpacking libimath-3-1-29t64:amd64 (3.1.9-3.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.4917672Z Selecting previously unselected package liblc3-1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5049048Z Preparing to unpack .../142-liblc3-1_1.0.4-3build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5057078Z Unpacking liblc3-1:amd64 (1.0.4-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5275024Z Selecting previously unselected package libldacbt-enc2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5404905Z Preparing to unpack .../143-libldacbt-enc2_2.0.2.3+git20200429+ed310a0-4ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5412786Z Unpacking libldacbt-enc2:amd64 (2.0.2.3+git20200429+ed310a0-4ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5766586Z Preparing to unpack .../144-libxslt1.1_1.1.39-0exp1ubuntu0.24.04.3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.5824185Z Unpacking libxslt1.1:amd64 (1.1.39-0exp1ubuntu0.24.04.3) over (1.1.39-0exp1ubuntu0.24.04.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6143284Z Selecting previously unselected package libraptor2-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6275034Z Preparing to unpack .../145-libraptor2-0_2.0.16-3ubuntu0.1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6284213Z Unpacking libraptor2-0:amd64 (2.0.16-3ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6505554Z Selecting previously unselected package liblrdf0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6633148Z Preparing to unpack .../146-liblrdf0_0.6.1-4build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6641221Z Unpacking liblrdf0:amd64 (0.6.1-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6857737Z Selecting previously unselected package libltc11:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6986807Z Preparing to unpack .../147-libltc11_1.3.2-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.6994652Z Unpacking libltc11:amd64 (1.3.2-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.7201138Z Selecting previously unselected package libmanette-0.2-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.7330677Z Preparing to unpack .../148-libmanette-0.2-0_0.2.7-1build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.7342496Z Unpacking libmanette-0.2-0:amd64 (0.2.7-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.7551491Z Selecting previously unselected package libmfx1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.7678919Z Preparing to unpack .../149-libmfx1_22.5.4-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.7686595Z Unpacking libmfx1:amd64 (22.5.4-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.8720280Z Selecting previously unselected package libmjpegutils-2.1-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.8856802Z Preparing to unpack .../150-libmjpegutils-2.1-0t64_1%3a2.1.0+debian-8.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.8865456Z Unpacking libmjpegutils-2.1-0t64:amd64 (1:2.1.0+debian-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9094211Z Selecting previously unselected package libmodplug1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9227240Z Preparing to unpack .../151-libmodplug1_1%3a0.8.9.0-3build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9235142Z Unpacking libmodplug1:amd64 (1:0.8.9.0-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9459828Z Selecting previously unselected package libmpcdec6:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9593361Z Preparing to unpack .../152-libmpcdec6_2%3a0.1~r495-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9602353Z Unpacking libmpcdec6:amd64 (2:0.1~r495-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9810136Z Selecting previously unselected package libmpeg2encpp-2.1-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9952429Z Preparing to unpack .../153-libmpeg2encpp-2.1-0t64_1%3a2.1.0+debian-8.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:50.9961587Z Unpacking libmpeg2encpp-2.1-0t64:amd64 (1:2.1.0+debian-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0182846Z Selecting previously unselected package libmplex2-2.1-0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0313700Z Preparing to unpack .../154-libmplex2-2.1-0t64_1%3a2.1.0+debian-8.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0322837Z Unpacking libmplex2-2.1-0t64:amd64 (1:2.1.0+debian-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0532695Z Selecting previously unselected package libneon27t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0664119Z Preparing to unpack .../155-libneon27t64_0.33.0-1.1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0673711Z Unpacking libneon27t64:amd64 (0.33.0-1.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.0906925Z Selecting previously unselected package libnice10:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1035525Z Preparing to unpack .../156-libnice10_0.1.21-2build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1044723Z Unpacking libnice10:amd64 (0.1.21-2build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1275485Z Selecting previously unselected package libopenal-data.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1403588Z Preparing to unpack .../157-libopenal-data_1%3a1.23.1-4build1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1412808Z Unpacking libopenal-data (1:1.23.1-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1644415Z Selecting previously unselected package libopenexr-3-1-30:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1773518Z Preparing to unpack .../158-libopenexr-3-1-30_3.1.5-5.1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.1782134Z Unpacking libopenexr-3-1-30:amd64 (3.1.5-5.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.2176101Z Selecting previously unselected package libopenh264-7:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.2310649Z Preparing to unpack .../159-libopenh264-7_2.4.1+dfsg-1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.2319505Z Unpacking libopenh264-7:amd64 (2.4.1+dfsg-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.2596451Z Selecting previously unselected package libopenni2-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.2735682Z Preparing to unpack .../160-libopenni2-0_2.2.0.33+dfsg-18_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.2895220Z Unpacking libopenni2-0:amd64 (2.2.0.33+dfsg-18) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3178239Z Selecting previously unselected package libqrencode4:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3314565Z Preparing to unpack .../161-libqrencode4_4.1.1-1build2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3322454Z Unpacking libqrencode4:amd64 (4.1.1-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3521866Z Selecting previously unselected package libsecret-common.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3655481Z Preparing to unpack .../162-libsecret-common_0.21.4-1build3_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3663420Z Unpacking libsecret-common (0.21.4-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.3871743Z Selecting previously unselected package libsecret-1-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4004824Z Preparing to unpack .../163-libsecret-1-0_0.21.4-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4015302Z Unpacking libsecret-1-0:amd64 (0.21.4-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4433839Z Selecting previously unselected package libsndio7.0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4569206Z Preparing to unpack .../164-libsndio7.0_1.9.0-0.3build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4582707Z Unpacking libsndio7.0:amd64 (1.9.0-0.3build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4792044Z Selecting previously unselected package libsoundtouch1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4927386Z Preparing to unpack .../165-libsoundtouch1_2.3.2+ds1-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.4935845Z Unpacking libsoundtouch1:amd64 (2.3.2+ds1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.5183851Z Selecting previously unselected package libspandsp2t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.5317936Z Preparing to unpack .../166-libspandsp2t64_0.0.6+dfsg-2.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.5325433Z Unpacking libspandsp2t64:amd64 (0.0.6+dfsg-2.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.5573682Z Selecting previously unselected package libsrtp2-1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.5704413Z Preparing to unpack .../167-libsrtp2-1_2.5.0-3build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.5712703Z Unpacking libsrtp2-1:amd64 (2.5.0-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6055091Z Preparing to unpack .../168-libssh-4_0.10.6-2ubuntu0.2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6114375Z Unpacking libssh-4:amd64 (0.10.6-2ubuntu0.2) over (0.10.6-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6389732Z Selecting previously unselected package libwayland-server0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6523197Z Preparing to unpack .../169-libwayland-server0_1.22.0-2.1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6534246Z Unpacking libwayland-server0:amd64 (1.22.0-2.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6749563Z Selecting previously unselected package libwildmidi2:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6881293Z Preparing to unpack .../170-libwildmidi2_0.4.3-1build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.6889073Z Unpacking libwildmidi2:amd64 (0.4.3-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7111724Z Selecting previously unselected package libwoff1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7242429Z Preparing to unpack .../171-libwoff1_1.0.2-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7259803Z Unpacking libwoff1:amd64 (1.0.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7477955Z Selecting previously unselected package libxcb-xkb1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7606630Z Preparing to unpack .../172-libxcb-xkb1_1.15-1ubuntu2_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7614836Z Unpacking libxcb-xkb1:amd64 (1.15-1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7839492Z Selecting previously unselected package libxkbcommon-x11-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7967586Z Preparing to unpack .../173-libxkbcommon-x11-0_1.6.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.7975618Z Unpacking libxkbcommon-x11-0:amd64 (1.6.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8183924Z Selecting previously unselected package libzbar0t64:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8310694Z Preparing to unpack .../174-libzbar0t64_0.23.93-4build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8318317Z Unpacking libzbar0t64:amd64 (0.23.93-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8537608Z Selecting previously unselected package libzxing3:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8665986Z Preparing to unpack .../175-libzxing3_2.2.1-3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8675203Z Unpacking libzxing3:amd64 (2.2.1-3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.8924509Z Selecting previously unselected package xfonts-encodings.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.9052963Z Preparing to unpack .../176-xfonts-encodings_1%3a1.0.5-0ubuntu2_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.9060856Z Unpacking xfonts-encodings (1:1.0.5-0ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.9351351Z Selecting previously unselected package xfonts-utils.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.9481719Z Preparing to unpack .../177-xfonts-utils_1%3a7.7+6build3_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.9488943Z Unpacking xfonts-utils (1:7.7+6build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:51.9963180Z Selecting previously unselected package xfonts-cyrillic.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0095907Z Preparing to unpack .../178-xfonts-cyrillic_1%3a1.0.5+nmu1_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0104890Z Unpacking xfonts-cyrillic (1:1.0.5+nmu1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0457073Z Selecting previously unselected package xfonts-scalable.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0588257Z Preparing to unpack .../179-xfonts-scalable_1%3a1.0.3-1.3_all.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0599264Z Unpacking xfonts-scalable (1:1.0.3-1.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0852388Z Selecting previously unselected package libgstreamer-plugins-bad1.0-0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0979824Z Preparing to unpack .../180-libgstreamer-plugins-bad1.0-0_1.24.2-1ubuntu4_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.0986959Z Unpacking libgstreamer-plugins-bad1.0-0:amd64 (1.24.2-1ubuntu4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.1374539Z Selecting previously unselected package libdca0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.1503891Z Preparing to unpack .../181-libdca0_0.0.7-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.1511495Z Unpacking libdca0:amd64 (0.0.7-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.1730846Z Selecting previously unselected package libopenal1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.1859079Z Preparing to unpack .../182-libopenal1_1%3a1.23.1-4build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.1866796Z Unpacking libopenal1:amd64 (1:1.23.1-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2137530Z Selecting previously unselected package libsbc1:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2265934Z Preparing to unpack .../183-libsbc1_2.0-1build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2275559Z Unpacking libsbc1:amd64 (2.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2487686Z Selecting previously unselected package libvo-aacenc0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2618373Z Preparing to unpack .../184-libvo-aacenc0_0.1.3-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2626766Z Unpacking libvo-aacenc0:amd64 (0.1.3-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2839425Z Selecting previously unselected package libvo-amrwbenc0:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2969704Z Preparing to unpack .../185-libvo-amrwbenc0_0.1.3-2build1_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.2978007Z Unpacking libvo-amrwbenc0:amd64 (0.1.3-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.3193944Z Selecting previously unselected package gstreamer1.0-plugins-bad:amd64.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.3327890Z Preparing to unpack .../186-gstreamer1.0-plugins-bad_1.24.2-1ubuntu4_amd64.deb ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.3336326Z Unpacking gstreamer1.0-plugins-bad:amd64 (1.24.2-1ubuntu4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5106698Z Setting up libgme0:amd64 (0.6.3-7build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5129977Z Setting up libchromaprint1:amd64 (1.5.1-5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5152835Z Setting up libssh-gcrypt-4:amd64 (0.10.6-2ubuntu0.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5171659Z Setting up libhwy1t64:amd64 (1.0.7-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5192612Z Setting up libcairo-script-interpreter2:amd64 (1.18.0-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5219350Z Setting up libfreeaptx0:amd64 (0.1.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5245837Z Setting up libdvdread8t64:amd64 (6.1.3-1.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5266324Z Setting up libudfread0:amd64 (1.1.2-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5287584Z Setting up libmodplug1:amd64 (1:0.8.9.0-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5310266Z Setting up libcdparanoia0:amd64 (3.10.2+debian-14build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5331703Z Setting up libwayland-server0:amd64 (1.22.0-2.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5352118Z Setting up libvo-amrwbenc0:amd64 (0.1.3-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5376165Z Setting up libraw1394-11:amd64 (2.1.2-2build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5401863Z Setting up libsbc1:amd64 (2.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5423784Z Setting up libneon27t64:amd64 (0.33.0-1.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5452855Z Setting up libtag1v5-vanilla:amd64 (1.13.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5475602Z Setting up libharfbuzz-icu0:amd64 (8.3.0-2build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5499549Z Setting up libopenni2-0:amd64 (2.2.0.33+dfsg-18) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5736463Z Setting up libspeex1:amd64 (1.2.1-2ubuntu2.24.04.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5757701Z Setting up libshine3:amd64 (3.1.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5781706Z Setting up libcaca0:amd64 (0.99.beta20-4ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5803413Z Setting up libvpl2 (2023.3.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5825043Z Setting up libv4lconvert0t64:amd64 (1.26.1-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5848241Z Setting up libx264-164:amd64 (2:0.164.3108+git31e19f9-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5872574Z Setting up libtwolame0:amd64 (0.4.0-2build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5894351Z Setting up libmbedcrypto7t64:amd64 (2.28.8-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5922511Z Setting up libwoff1:amd64 (1.0.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5943686Z Setting up liblc3-1:amd64 (1.0.4-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5967863Z Setting up libqrencode4:amd64 (4.1.1-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.5989647Z Setting up libhyphen0:amd64 (2.8.8-7build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6035764Z Setting up libgsm1:amd64 (1.0.22-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6063934Z Setting up libvisual-0.4-0:amd64 (0.4.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6090815Z Setting up libsoxr0:amd64 (0.1.3-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6111738Z Setting up libzix-0-0:amd64 (0.4.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6133647Z Setting up libcodec2-1.2:amd64 (1.2.0-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6155387Z Setting up libsrtp2-1:amd64 (2.5.0-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6178084Z Setting up libmysofa1:amd64 (1.3.2+dfsg-2ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6201592Z Setting up libldacbt-enc2:amd64 (2.0.2.3+git20200429+ed310a0-4ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6224375Z Setting up fonts-wqy-zenhei (0.9.45-8) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6358110Z Setting up libwebrtc-audio-processing1:amd64 (0.3.1-0ubuntu6) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6381260Z Setting up fonts-freefont-ttf (20211204+svn4273-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6402889Z Setting up libevent-2.1-7t64:amd64 (2.1.12-stable-9ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6427822Z Setting up libsvtav1enc1d1:amd64 (1.7.0+dfsg-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6449763Z Setting up libsoup-3.0-common (3.4.4-5ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6471944Z Setting up libmpg123-0t64:amd64 (1.32.5-1ubuntu1.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6500802Z Setting up libcjson1:amd64 (1.7.17-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6523729Z Setting up libxvidcore4:amd64 (2:1.3.7-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6548955Z Setting up libmpcdec6:amd64 (2:0.1~r495-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6570256Z Setting up libmjpegutils-2.1-0t64:amd64 (1:2.1.0+debian-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6591895Z Setting up librav1e0:amd64 (0.7.1-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6616424Z Setting up liborc-0.4-0t64:amd64 (1:0.4.38-1ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6647214Z Setting up libxcb-xkb1:amd64 (1.15-1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6673395Z Setting up libvo-aacenc0:amd64 (0.1.3-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6696159Z Setting up librist4:amd64 (0.2.10+dfsg-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6717405Z Setting up libglib2.0-0t64:amd64 (2.80.0-6ubuntu3.8) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.6993838Z Setting up libblas3:amd64 (3.12.0-3build1.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7055840Z update-alternatives: using /usr/lib/x86_64-linux-gnu/blas/libblas.so.3 to provide /usr/lib/x86_64-linux-gnu/libblas.so.3 (libblas.so.3-x86_64-linux-gnu) in auto mode
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7073187Z Setting up libegl-mesa0:amd64 (25.2.8-0ubuntu0.24.04.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7122853Z Setting up libsoundtouch1:amd64 (2.3.2+ds1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7148693Z Setting up libglib2.0-data (2.80.0-6ubuntu3.8) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7170588Z Setting up libplacebo338:amd64 (6.338.2-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7198600Z Setting up libgles2:amd64 (1.7.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7224273Z Setting up fonts-tlwg-loma-otf (1:0.7.3-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7248582Z Setting up libva2:amd64 (2.20.0-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7269904Z Setting up libspa-0.2-modules:amd64 (1.0.5-1ubuntu3.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7294425Z Setting up libzxing3:amd64 (2.2.1-3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7316345Z Setting up xfonts-encodings (1:1.0.5-0ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7339794Z Setting up libopus0:amd64 (1.4-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7361753Z Setting up libfaad2:amd64 (2.11.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7385488Z Setting up libxkbcommon-x11-0:amd64 (1.6.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7413596Z Setting up libdc1394-25:amd64 (2.2.6-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7435250Z Setting up libpng16-16t64:amd64 (1.6.43-5ubuntu0.4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7457457Z Setting up libimath-3-1-29t64:amd64 (3.1.9-3.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7481014Z Setting up libunibreak5:amd64 (5.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7501208Z Setting up libdv4t64:amd64 (1.0.0-17.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7523346Z Setting up gir1.2-glib-2.0:amd64 (2.80.0-6ubuntu3.8) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7546075Z Setting up libjxl0.7:amd64 (0.7.0-10.2ubuntu6.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7583229Z Setting up libssh-4:amd64 (0.10.6-2ubuntu0.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7607700Z Setting up libopenh264-7:amd64 (2.4.1+dfsg-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7633905Z Setting up libltc11:amd64 (1.3.2-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7659080Z Setting up libx265-199:amd64 (3.5-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7683614Z Setting up libv4l-0t64:amd64 (1.26.1-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7703350Z Setting up libavtp0:amd64 (0.2.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7727384Z Setting up libsndio7.0:amd64 (1.9.0-0.3build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7888341Z Setting up libdirectfb-1.7-7t64:amd64 (1.7.7-11.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7908832Z Setting up libspandsp2t64:amd64 (0.0.6+dfsg-2.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7931445Z Setting up libvidstab1.1:amd64 (1.1.0-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7954877Z Setting up libvpx9:amd64 (1.14.0-1ubuntu2.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.7977318Z Setting up libsrt1.5-gnutls:amd64 (1.5.3-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8002033Z Setting up libtag1v5:amd64 (1.13.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8031298Z Setting up libflite1:amd64 (2.2-6build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8060206Z Setting up libdav1d7:amd64 (1.4.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8084232Z Setting up libva-drm2:amd64 (2.20.0-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8107411Z Setting up fonts-ipafont-gothic (00303-21ubuntu1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8179117Z update-alternatives: using /usr/share/fonts/opentype/ipafont-gothic/ipag.ttf to provide /usr/share/fonts/truetype/fonts-japanese-gothic.ttf (fonts-japanese-gothic.ttf) in auto mode
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8221253Z Setting up ocl-icd-libopencl1:amd64 (2.3.2-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8242938Z Setting up libasyncns0:amd64 (0.8-6build4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8264923Z Setting up libwildmidi2:amd64 (0.4.3-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8287906Z Setting up libvdpau1:amd64 (1.5-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8317423Z Setting up libwavpack1:amd64 (5.6.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8338142Z Setting up libbs2b0:amd64 (3.1.0+dfsg-7build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8363243Z Setting up libtheora0:amd64 (1.1.1+dfsg.1-16.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8384224Z Setting up libxslt1.1:amd64 (1.1.39-0exp1ubuntu0.24.04.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8404609Z Setting up libegl1:amd64 (1.7.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8429355Z Setting up libdecor-0-0:amd64 (0.2.2-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8454764Z Setting up libdca0:amd64 (0.0.7-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8481227Z Setting up libzimg2:amd64 (3.0.5+ds1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8505743Z Setting up libopenal-data (1:1.23.1-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8533217Z Setting up libabsl20220623t64:amd64 (20220623.1-3.1ubuntu3.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8563565Z Setting up libflac12t64:amd64 (1.4.3+ds-2.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8584503Z Setting up libgtk-4-common (4.14.5+ds-0ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8605105Z Setting up libmpeg2encpp-2.1-0t64:amd64 (1:2.1.0+debian-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8629096Z Setting up glib-networking-common (2.80.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8649336Z Setting up libmfx1:amd64 (22.5.4-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8686221Z Setting up libbluray2:amd64 (1:1.3.4-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8711874Z Setting up libsamplerate0:amd64 (0.2.2-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8734785Z Setting up timgm6mb-soundfont (1.3-5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8829802Z update-alternatives: using /usr/share/sounds/sf2/TimGM6mb.sf2 to provide /usr/share/sounds/sf2/default-GM.sf2 (default-GM.sf2) in auto mode
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8877484Z update-alternatives: using /usr/share/sounds/sf2/TimGM6mb.sf2 to provide /usr/share/sounds/sf3/default-GM.sf3 (default-GM.sf3) in auto mode
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8894515Z Setting up libva-x11-2:amd64 (2.20.0-2ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8916859Z Setting up libyuv0:amd64 (0.0~git202401110.af6ac82-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8941443Z Setting up libmplex2-2.1-0t64:amd64 (1:2.1.0+debian-8.1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8963224Z Setting up libpipewire-0.3-0t64:amd64 (1.0.5-1ubuntu3.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.8990712Z Setting up libopenmpt0t64:amd64 (0.7.3-1.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9012595Z Setting up libzvbi-common (0.2.42-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9035261Z Setting up libsecret-common (0.21.4-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9060272Z Setting up libmp3lame0:amd64 (3.100-6build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9081510Z Setting up libgraphene-1.0-0:amd64 (1.10.8-3build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9103812Z Setting up libvorbisenc2:amd64 (1.3.7-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9126753Z Setting up libdvdnav4:amd64 (6.1.1-3build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9159040Z Setting up fonts-unifont (1:15.1.01-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9184607Z Setting up libaa1:amd64 (1.4p5-51.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9215925Z Setting up libiec61883-0:amd64 (1.2.0-6build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9239505Z Setting up libserd-0-0:amd64 (0.32.2-1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9263396Z Setting up libavc1394-0:amd64 (0.5.4-5build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:52.9286039Z Setting up session-migration (0.3.9build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0594652Z Created symlink /etc/systemd/user/graphical-session-pre.target.wants/session-migration.service → /usr/lib/systemd/user/session-migration.service.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0596315Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0626179Z Setting up liblapack3:amd64 (3.12.0-3build1.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0697888Z update-alternatives: using /usr/lib/x86_64-linux-gnu/lapack/liblapack.so.3 to provide /usr/lib/x86_64-linux-gnu/liblapack.so.3 (liblapack.so.3-x86_64-linux-gnu) in auto mode
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0715423Z Setting up libproxy1v5:amd64 (0.5.4-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0740688Z Setting up libzvbi0t64:amd64 (0.2.42-2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0774608Z Setting up libmanette-0.2-0:amd64 (0.2.7-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0804996Z Setting up libraptor2-0:amd64 (2.0.16-3ubuntu0.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0838146Z Setting up libglib2.0-bin (2.80.0-6ubuntu3.8) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0862016Z Setting up libzbar0t64:amd64 (0.23.93-4build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0892971Z Setting up libgstreamer-plugins-base1.0-0:amd64 (1.24.2-1ubuntu0.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0915568Z Setting up libavutil58:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0939885Z Setting up libopenal1:amd64 (1:1.23.1-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.0971410Z Setting up xfonts-utils (1:7.7+6build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1017709Z Setting up librsvg2-2:amd64 (2.58.0+dfsg-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1057998Z Setting up libsecret-1-0:amd64 (0.21.4-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1090038Z Setting up libgstreamer-plugins-good1.0-0:amd64 (1.24.2-1ubuntu1.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1119787Z Setting up libgstreamer-gl1.0-0:amd64 (1.24.2-1ubuntu0.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1145320Z Setting up gstreamer1.0-plugins-base:amd64 (1.24.2-1ubuntu0.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1168400Z Setting up libass9:amd64 (1:0.17.1-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1189690Z Setting up libswresample4:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1215436Z Setting up libopenexr-3-1-30:amd64 (3.1.5-5.1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1237853Z Setting up libshout3:amd64 (2.4.6-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1258463Z Setting up libgav1-1:amd64 (0.18.0-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1289210Z Setting up libavcodec60:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1312641Z Setting up librubberband2:amd64 (3.3.0+dfsg-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1337568Z Setting up libjack-jackd2-0:amd64 (1.9.21~dfsg-3ubuntu3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1376010Z Setting up libsord-0-0:amd64 (0.16.16-2build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1396967Z Setting up xfonts-cyrillic (1:1.0.5+nmu1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1897688Z Setting up libpostproc57:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1922920Z Setting up libsratom-0-0:amd64 (0.6.16-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.1945740Z Setting up libgtk-4-1:amd64 (4.14.5+ds-0ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4372999Z Setting up libsndfile1:amd64 (1.2.2-1ubuntu5.24.04.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4399739Z Setting up liblilv-0-0:amd64 (0.24.22-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4430729Z Setting up libinstpatch-1.0-2:amd64 (1.1.6-1build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4454901Z Setting up xfonts-scalable (1:1.0.3-1.3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4911325Z Setting up libswscale7:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4936243Z Setting up gsettings-desktop-schemas (46.1-0ubuntu1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4958344Z Setting up glib-networking-services (2.80.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.4985576Z Setting up libavif16:amd64 (1.0.4-1ubuntu3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5017312Z Setting up libpulse0:amd64 (1:16.1+dfsg1-2ubuntu10.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5096223Z Setting up liblrdf0:amd64 (0.6.1-4build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5134791Z Setting up libavformat60:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5157284Z Setting up libsphinxbase3t64:amd64 (0.8+5prealpha+1-17build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5181355Z Setting up glib-networking:amd64 (2.80.0-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5212054Z Setting up libsdl2-2.0-0:amd64 (2.30.0+dfsg-1ubuntu3.1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5234573Z Setting up libfluidsynth3:amd64 (2.3.4-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5261638Z Setting up libsoup-3.0-0:amd64 (3.4.4-5ubuntu0.7) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5288447Z Setting up libpocketsphinx3:amd64 (0.8.0+real5prealpha+1-15ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5316061Z Setting up libgssdp-1.6-0:amd64 (1.6.3-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5341350Z Setting up gstreamer1.0-plugins-good:amd64 (1.24.2-1ubuntu1.2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5362637Z Setting up libgupnp-1.6-0:amd64 (1.6.6-1build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5386183Z Setting up libavfilter9:amd64 (7:6.1.1-3ubuntu5) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5410758Z Setting up libgupnp-igd-1.6-0:amd64 (1.6.0-3build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5433777Z Setting up gstreamer1.0-libav:amd64 (1.24.1-1build1) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5459213Z Setting up libnice10:amd64 (0.1.21-2build3) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5485918Z Setting up libgstreamer-plugins-bad1.0-0:amd64 (1.24.2-1ubuntu4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5515776Z Setting up gstreamer1.0-plugins-bad:amd64 (1.24.2-1ubuntu4) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.5547345Z Processing triggers for libc-bin (2.39-0ubuntu8.6) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.6112610Z Processing triggers for man-db (2.12.0-4build2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.6172982Z Not building database; man-db/auto-update is not 'true'.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:53.6188860Z Processing triggers for fontconfig (2.15.0-1.1ubuntu2) ...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.7398804Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.7399427Z Running kernel seems to be up-to-date.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.7399933Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.7400167Z Restarting services...
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.7852281Z  systemctl restart packagekit.service php8.3-fpm.service polkit.service udisks2.service
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9290886Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9294395Z Service restarts being deferred:
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9295023Z  systemctl restart ModemManager.service
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9295627Z  systemctl restart networkd-dispatcher.service
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9296008Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9296270Z No containers need to be restarted.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9296607Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9296914Z No user sessions are running outdated binaries.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9297292Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:54.9297777Z No VM guests are running outdated hypervisor (qemu) binaries on this host.
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:55.9582152Z Downloading Chrome for Testing 145.0.7632.6 (playwright chromium v1208) from https://cdn.playwright.dev/chrome-for-testing-public/145.0.7632.6/linux64/chrome-linux64.zip
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.1921866Z |                                                                                |   0% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.3773698Z |■■■■■■■■                                                                        |  10% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.4730783Z |■■■■■■■■■■■■■■■■                                                                |  20% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.5783616Z |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.6756106Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.7667484Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                        |  50% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.8633203Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                |  60% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:56.9605599Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                        |  70% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:57.0517626Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                |  80% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:57.1461196Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■        |  90% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:47:57.2393237Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 167.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:00.4544191Z Chrome for Testing 145.0.7632.6 (playwright chromium v1208) downloaded to /home/runner/.cache/ms-playwright/chromium-1208
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:00.4547982Z Downloading Chrome Headless Shell 145.0.7632.6 (playwright chromium-headless-shell v1208) from https://cdn.playwright.dev/chrome-for-testing-public/145.0.7632.6/linux64/chrome-headless-shell-linux64.zip
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:00.6970315Z |                                                                                |   0% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:00.9658837Z |■■■■■■■■                                                                        |  10% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.0462742Z |■■■■■■■■■■■■■■■■                                                                |  20% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.1167873Z |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.1895839Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.2547609Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                        |  50% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.3355118Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                |  60% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.4092063Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                        |  70% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.4853194Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                |  80% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.5572259Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■        |  90% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:01.6227870Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 110.9 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:03.9480739Z Chrome Headless Shell 145.0.7632.6 (playwright chromium-headless-shell v1208) downloaded to /home/runner/.cache/ms-playwright/chromium_headless_shell-1208
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:03.9484628Z Downloading Firefox 146.0.1 (playwright firefox v1509) from https://cdn.playwright.dev/dbazure/download/playwright/builds/firefox/1509/firefox-ubuntu-24.04.zip
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.1232314Z |                                                                                |   0% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.2258338Z |■■■■■■■■                                                                        |  10% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.2954387Z |■■■■■■■■■■■■■■■■                                                                |  20% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.3505267Z |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.4029837Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.4502693Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                        |  50% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.4972629Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                |  60% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.5438262Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                        |  70% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.5867664Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                |  80% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.6276219Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■        |  90% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:04.6760052Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 99.5 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:06.7676406Z Firefox 146.0.1 (playwright firefox v1509) downloaded to /home/runner/.cache/ms-playwright/firefox-1509
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:06.7682183Z Downloading WebKit 26.0 (playwright webkit v2248) from https://cdn.playwright.dev/dbazure/download/playwright/builds/webkit/2248/webkit-ubuntu-24.04.zip
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:06.9220590Z |                                                                                |   0% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.0268337Z |■■■■■■■■                                                                        |  10% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.1004932Z |■■■■■■■■■■■■■■■■                                                                |  20% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.1665964Z |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.2232461Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.2779246Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                        |  50% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.3335762Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                |  60% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.3882779Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                        |  70% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.4366369Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                |  80% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.4851628Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■        |  90% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:07.5351173Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 99.2 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.6602881Z WebKit 26.0 (playwright webkit v2248) downloaded to /home/runner/.cache/ms-playwright/webkit-2248
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.6606798Z Downloading FFmpeg (playwright ffmpeg v1011) from https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8232106Z |                                                                                |   0% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8279921Z |■■■■■■■■                                                                        |  10% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8308523Z |■■■■■■■■■■■■■■■■                                                                |  20% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8330823Z |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8353217Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8375213Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                        |  50% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8399749Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                |  60% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8425298Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                        |  70% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8453302Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                |  80% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8475964Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■        |  90% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.8498622Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 2.3 MiB
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:09.9212572Z FFmpeg (playwright ffmpeg v1011) downloaded to /home/runner/.cache/ms-playwright/ffmpeg-1011
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:10.2545706Z ##[group]Run npx playwright test
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:10.2546035Z [36;1mnpx playwright test[0m
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:10.2577564Z shell: /usr/bin/bash -e {0}
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:10.2577833Z env:
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:10.2578060Z   BASE_URL: https://rubikvault.com
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:10.2578343Z ##[endgroup]
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:11.6218951Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:11.6219507Z Running 2 tests using 1 worker
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:11.6221282Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:33.5464926Z   ✘  1 tests/e2e/ops.spec.mjs:3:1 › ops render stamp goes ok (20.0s)
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7078610Z   ✘  2 tests/e2e/ops.spec.mjs:15:1 › ops truth-chain sections render (20.0s)
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7236285Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7241617Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7250779Z   1) tests/e2e/ops.spec.mjs:3:1 › ops render stamp goes ok ─────────────────────────────────────────
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7251786Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7252315Z     [31mTest timeout of 20000ms exceeded.[39m
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7252832Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7254139Z     Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7255228Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7255532Z     Locator: locator('#ops-bridge')
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7256431Z     Expected pattern: [32m/ok|degraded/[39m
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7257145Z     Error: element(s) not found
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7257502Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7257663Z     Call log:
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7258654Z     [2m  - Expect "toHaveAttribute" with timeout 20000ms[22m
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7259254Z     [2m  - waiting for locator('#ops-bridge')[22m
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7259548Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7259555Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7259749Z        5 |   expect(page.url()).toContain('/ops/');
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7260255Z        6 |   const bridge = page.locator('#ops-bridge');
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7261299Z     >  7 |   await expect(bridge).toHaveAttribute('data-status', /ok|degraded/, { timeout: 20000 });
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7261974Z          |                        ^
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7262573Z        8 |   await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail/);
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7263426Z        9 |   const pipelineExpected = await bridge.getAttribute('data-pipeline-expected');
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7264167Z       10 |   if (pipelineExpected === 'false') {
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7265074Z         at /home/runner/work/rubikvault-site/rubikvault-site/tests/e2e/ops.spec.mjs:7:24
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7265568Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7265935Z     Error Context: test-results/ops-ops-render-stamp-goes-ok/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7266375Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7266868Z   2) tests/e2e/ops.spec.mjs:15:1 › ops truth-chain sections render ─────────────────────────────────
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267224Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267412Z     [31mTest timeout of 20000ms exceeded.[39m
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267605Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267809Z     Error: page.waitForResponse: Test timeout of 20000ms exceeded.
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7268064Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7268135Z       14 |
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7268439Z       15 | test('ops truth-chain sections render', async ({ page }) => {
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7268891Z     > 16 |   const responsePromise = page.waitForResponse((resp) => {
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7269251Z          |                                ^
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7269710Z       17 |     return resp.url().includes('/api/mission-control/summary') && resp.status() === 200;
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7270128Z       18 |   });
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7270626Z       19 |   await page.goto('/ops/', { waitUntil: 'domcontentloaded' });
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7271171Z         at /home/runner/work/rubikvault-site/rubikvault-site/tests/e2e/ops.spec.mjs:16:32
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7271495Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7271782Z     Error Context: test-results/ops-ops-truth-chain-sections-render/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7272115Z 
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7272200Z   2 failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7272690Z     tests/e2e/ops.spec.mjs:3:1 › ops render stamp goes ok ──────────────────────────────────────────
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7273617Z     tests/e2e/ops.spec.mjs:15:1 › ops truth-chain sections render ──────────────────────────────────
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7490702Z ##[error]Process completed with exit code 1.
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7595704Z Post job cleanup.
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8530123Z [command]/usr/bin/git version
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8567115Z git version 2.52.0
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8609972Z Temporarily overriding HOME='/home/runner/work/_temp/a0ca4693-b1cf-4441-9ef7-ce8bd27c709f' before making global git config changes
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8611731Z Adding repository directory to the temporary git global config as a safe directory
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8616673Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8652549Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8685366Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8912528Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8932902Z http.https://github.com/.extraheader
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8945267Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.8978274Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.9199913Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.9229362Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.9555046Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Forecast Daily Pipeline
```
latest_run_id=21883339643
Daily Forecast Run	UNKNOWN STEP	﻿2026-02-10T21:37:22.6620495Z Current runner version: '2.331.0'
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6645466Z ##[group]Runner Image Provisioner
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6646267Z Hosted Compute Agent
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6646890Z Version: 20260123.484
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6647509Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6648184Z Build Date: 2026-01-23T19:41:17Z
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6648885Z Worker ID: {458476d8-a784-4883-bc00-b698e7075738}
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6649663Z Azure Region: westus
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6650231Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6652304Z ##[group]Operating System
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6653028Z Ubuntu
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6653463Z 24.04.3
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6653900Z LTS
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6654498Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6654964Z ##[group]Runner Image
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6655512Z Image: ubuntu-24.04
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6656053Z Version: 20260201.15.1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6657288Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6658846Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6659744Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6663000Z ##[group]GITHUB_TOKEN Permissions
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6665416Z Actions: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6665929Z ArtifactMetadata: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6666575Z Attestations: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6667052Z Checks: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6667528Z Contents: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6668047Z Deployments: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6668596Z Discussions: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6669054Z Issues: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6669569Z Metadata: read
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6670070Z Models: read
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6670508Z Packages: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6671347Z Pages: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6672010Z PullRequests: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6672561Z RepositoryProjects: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6673083Z SecurityEvents: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6673705Z Statuses: write
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6674217Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6676389Z Secret source: Actions
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.6677239Z Prepare workflow directory
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.7095050Z Prepare all required actions
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:22.7133843Z Getting action download info
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.1986119Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.2938257Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.3954760Z Download action repository 'actions/upload-artifact@v4' (SHA:ea165f8d65b6e75b540449e92b4886f43607fa02)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6179424Z Complete job name: Daily Forecast Run
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6906678Z ##[group]Run actions/checkout@v4
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6907509Z with:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6907876Z   fetch-depth: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6908305Z   repository: RubikVault/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6909018Z   token: ***
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6909397Z   ssh-strict: true
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6909775Z   ssh-user: git
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6910191Z   persist-credentials: true
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6910615Z   clean: true
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6911166Z   sparse-checkout-cone-mode: true
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6911640Z   fetch-tags: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6912029Z   show-progress: true
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6912416Z   lfs: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6912768Z   submodules: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6913165Z   set-safe-directory: true
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6913869Z env:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6914261Z   NODE_VERSION: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6914647Z   OMP_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6915072Z   MKL_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6915459Z   OPENBLAS_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.6915915Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8042430Z Syncing repository: RubikVault/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8044423Z ##[group]Getting Git version info
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8045207Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8046436Z [command]/usr/bin/git version
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8110406Z git version 2.52.0
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8139022Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8153758Z Temporarily overriding HOME='/home/runner/work/_temp/f929ff4e-2826-49b3-88d1-64b9617bb482' before making global git config changes
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8155305Z Adding repository directory to the temporary git global config as a safe directory
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8168624Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8208797Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8212711Z ##[group]Initializing the repository
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8217528Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8310467Z hint: Using 'master' as the name for the initial branch. This default branch name
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8312765Z hint: will change to "main" in Git 3.0. To configure the initial branch name
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8314472Z hint: to use in all of your new repositories, which will suppress this warning,
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8315393Z hint: call:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8315808Z hint:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8316378Z hint: 	git config --global init.defaultBranch <name>
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8317051Z hint:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8317685Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8318753Z hint: 'development'. The just-created branch can be renamed via this command:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8320055Z hint:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8320498Z hint: 	git branch -m <name>
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8321173Z hint:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8321901Z hint: Disable this message with "git config set advice.defaultBranchName false"
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8323203Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8326064Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8363472Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8364188Z ##[group]Disabling automatic garbage collection
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8368144Z [command]/usr/bin/git config --local gc.auto 0
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8400901Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8401822Z ##[group]Setting up auth
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8408419Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8443007Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8768567Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.8803375Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.9039853Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.9077650Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.9312582Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.9350697Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.9352276Z ##[group]Fetching the repository
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:23.9361545Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2:refs/remotes/origin/main
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.0980160Z From https://github.com/RubikVault/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.0981330Z  * [new ref]         2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2 -> origin/main
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1012454Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1013114Z ##[group]Determining the checkout info
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1015841Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1022529Z [command]/usr/bin/git sparse-checkout disable
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1066673Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1094774Z ##[group]Checking out the ref
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.1101434Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2248796Z Switched to a new branch 'main'
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2249794Z branch 'main' set up to track 'origin/main'.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2266038Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2306604Z [command]/usr/bin/git log -1 --format=%H
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2331674Z 2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2578443Z ##[group]Run actions/setup-node@v4
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2578956Z with:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2579307Z   node-version: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2579664Z   cache: npm
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2580021Z   always-auth: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2580394Z   check-latest: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2581113Z   token: ***
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2581473Z env:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2581799Z   NODE_VERSION: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2582173Z   OMP_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2582570Z   MKL_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2582954Z   OPENBLAS_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.2583330Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.4543648Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.4550335Z ##[group]Environment details
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.7932116Z node: v20.20.0
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.7933172Z npm: 10.8.2
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.7933606Z yarn: 1.22.22
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.7934552Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.7956927Z [command]/opt/hostedtoolcache/node/20.20.0/x64/bin/npm config get cache
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:25.9223586Z /home/runner/.npm
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:26.2705535Z Cache hit for: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:27.5913399Z Received 0 of 69391852 (0.0%), 0.0 MBs/sec
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.2835906Z Received 69391852 of 69391852 (100.0%), 39.0 MBs/sec
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.2881824Z Cache Size: ~66 MB (69391852 B)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.2959778Z [command]/usr/bin/tar -xf /home/runner/work/_temp/98b3ac89-d44f-47d0-8de6-f031bbf360c0/cache.tzst -P -C /home/runner/work/rubikvault-site/rubikvault-site --use-compress-program unzstd
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4607297Z Cache restored successfully
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4758955Z Cache restored from key: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4912037Z ##[group]Run npm ci --prefer-offline
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4912477Z [36;1mnpm ci --prefer-offline[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4956070Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4956466Z env:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4956669Z   NODE_VERSION: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4956886Z   OMP_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4957100Z   MKL_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4957340Z   OPENBLAS_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:28.4957583Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:30.1484045Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:30.2045423Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.1451948Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.6364741Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.6366484Z added 106 packages, and audited 107 packages in 3s
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.6367399Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.6368019Z 18 packages are looking for funding
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.6373699Z   run `npm fund` for details
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7199692Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7200632Z 6 vulnerabilities (2 moderate, 4 high)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7201362Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7201890Z To address all issues (including breaking changes), run:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7202530Z   npm audit fix --force
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7202781Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7204016Z Run `npm audit` for details.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7612346Z ##[group]Run DATE_ARG=""
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7612663Z [36;1mDATE_ARG=""[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7612876Z [36;1mif [ -n "" ]; then[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7613103Z [36;1m  DATE_ARG="--date="[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7613321Z [36;1mfi[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7613533Z [36;1m[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7613862Z [36;1mnode scripts/forecast/run_daily.mjs $DATE_ARG 2>&1 | tee pipeline.log[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7614249Z [36;1m[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7614436Z [36;1m# Extract result for summary[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7614774Z [36;1mif grep -q "PIPELINE COMPLETE" pipeline.log; then[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7615137Z [36;1m  echo "status=success" >> $GITHUB_OUTPUT[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7615409Z [36;1melse[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7615621Z [36;1m  echo "status=failed" >> $GITHUB_OUTPUT[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7615884Z [36;1mfi[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7649701Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7650039Z env:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7650263Z   NODE_VERSION: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7650474Z   OMP_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7650675Z   MKL_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7650874Z   OPENBLAS_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7651250Z   TZ: America/New_York
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.7651451Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8083320Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8084814Z ═══════════════════════════════════════════════════════════════
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8088356Z   FORECAST SYSTEM v3.0 — DAILY PIPELINE
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8089373Z ═══════════════════════════════════════════════════════════════
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8089891Z 
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8090439Z [Step 1] Loading policy and champion spec...
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8102972Z   Policy: rv-forecast v3.0.0
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8103631Z   Champion: v3.0-champion-0001
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8104231Z [Step 2] Resolving trading date...
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8318155Z   Trading Date: 2026-02-10
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8318987Z [Step 3] Ingesting snapshots...
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8335541Z [Ingest] Loaded universe: 517 tickers
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8390627Z [Ingest] Loaded prices for 517 tickers (batches=0, market-prices-fallback=517)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8459244Z   Universe: 517 tickers
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8460881Z   Missing price data: 0.0%
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8462019Z [Step 4] Running data quality gates...
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8463216Z   ✓ Data quality OK
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8463784Z [Step 5] Loading price history...
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8511547Z [Ingest] Loaded price history for 0 tickers
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8512222Z   Loaded history for 0 tickers
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8512776Z [Step 6] Generating forecasts...
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8515251Z [Forecast] Skipping A: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8518139Z [Forecast] Skipping AAPL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8519436Z [Forecast] Skipping ABBV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8521874Z [Forecast] Skipping ABNB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8522648Z [Forecast] Skipping ABT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8523432Z [Forecast] Skipping ACGL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8524186Z [Forecast] Skipping ACN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8524933Z [Forecast] Skipping ADBE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8525672Z [Forecast] Skipping ADI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8526431Z [Forecast] Skipping ADM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8527166Z [Forecast] Skipping ADP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8527898Z [Forecast] Skipping ADSK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8528802Z [Forecast] Skipping AEE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8529520Z [Forecast] Skipping AEP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8530235Z [Forecast] Skipping AES: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8531142Z [Forecast] Skipping AFL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8531905Z [Forecast] Skipping AIG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8533009Z [Forecast] Skipping AIZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8534008Z [Forecast] Skipping AJG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8534746Z [Forecast] Skipping AKAM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8535473Z [Forecast] Skipping ALB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8536209Z [Forecast] Skipping ALGN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8536928Z [Forecast] Skipping ALL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8537720Z [Forecast] Skipping ALLE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8538456Z [Forecast] Skipping AMAT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8539183Z [Forecast] Skipping AMCR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8539910Z [Forecast] Skipping AMD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8540621Z [Forecast] Skipping AME: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8541514Z [Forecast] Skipping AMGN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8542248Z [Forecast] Skipping AMP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8542968Z [Forecast] Skipping AMT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8543685Z [Forecast] Skipping AMZN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8544406Z [Forecast] Skipping ANET: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8545124Z [Forecast] Skipping AON: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8545836Z [Forecast] Skipping AOS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8546544Z [Forecast] Skipping APA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8547250Z [Forecast] Skipping APD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8547972Z [Forecast] Skipping APH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8548685Z [Forecast] Skipping APO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8549408Z [Forecast] Skipping APP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8550125Z [Forecast] Skipping APTV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8550854Z [Forecast] Skipping ARE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8551720Z [Forecast] Skipping ARM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8552443Z [Forecast] Skipping ASML: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8553161Z [Forecast] Skipping ATO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8553868Z [Forecast] Skipping AVB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8554610Z [Forecast] Skipping AVGO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8555331Z [Forecast] Skipping AVY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8556042Z [Forecast] Skipping AWK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8556753Z [Forecast] Skipping AXON: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8557467Z [Forecast] Skipping AXP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8558179Z [Forecast] Skipping AZN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8558892Z [Forecast] Skipping AZO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8559630Z [Forecast] Skipping BA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8560461Z [Forecast] Skipping BAC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8561337Z [Forecast] Skipping BALL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8562066Z [Forecast] Skipping BAX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8562786Z [Forecast] Skipping BBY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8588365Z [Forecast] Skipping BDX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8589106Z [Forecast] Skipping BEN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8589853Z [Forecast] Skipping BF.B: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8590587Z [Forecast] Skipping BG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8591543Z [Forecast] Skipping BIIB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8592260Z [Forecast] Skipping BK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8592978Z [Forecast] Skipping BKNG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8593935Z [Forecast] Skipping BKR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8594827Z [Forecast] Skipping BLDR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8595553Z [Forecast] Skipping BLK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8596290Z [Forecast] Skipping BMY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8596997Z [Forecast] Skipping BR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8597732Z [Forecast] Skipping BRK.B: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8598465Z [Forecast] Skipping BRO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8599173Z [Forecast] Skipping BSX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8599885Z [Forecast] Skipping BX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8600597Z [Forecast] Skipping BXP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8601455Z [Forecast] Skipping C: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8602155Z [Forecast] Skipping CAG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8602867Z [Forecast] Skipping CAH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8603599Z [Forecast] Skipping CARR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8604328Z [Forecast] Skipping CAT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8605036Z [Forecast] Skipping CB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8605748Z [Forecast] Skipping CBOE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8606478Z [Forecast] Skipping CBRE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8607206Z [Forecast] Skipping CCEP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8607932Z [Forecast] Skipping CCI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8608640Z [Forecast] Skipping CCL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8609361Z [Forecast] Skipping CDNS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8610083Z [Forecast] Skipping CDW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8610800Z [Forecast] Skipping CEG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8611663Z [Forecast] Skipping CF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8612384Z [Forecast] Skipping CFG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8613110Z [Forecast] Skipping CHD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8613835Z [Forecast] Skipping CHRW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8614568Z [Forecast] Skipping CHTR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8615277Z [Forecast] Skipping CI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8615994Z [Forecast] Skipping CINF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8616714Z [Forecast] Skipping CL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8617424Z [Forecast] Skipping CLX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8618163Z [Forecast] Skipping CMCSA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8618901Z [Forecast] Skipping CME: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8619616Z [Forecast] Skipping CMG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8620327Z [Forecast] Skipping CMI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8621206Z [Forecast] Skipping CMS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8621933Z [Forecast] Skipping CNC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8623660Z [Forecast] Skipping CNP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8624617Z [Forecast] Skipping COF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8625371Z [Forecast] Skipping COIN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8627779Z [Forecast] Skipping COO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8628508Z [Forecast] Skipping COP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8629228Z [Forecast] Skipping COR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8629956Z [Forecast] Skipping COST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8630685Z [Forecast] Skipping CPAY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8631586Z [Forecast] Skipping CPB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8632315Z [Forecast] Skipping CPRT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8633229Z [Forecast] Skipping CPT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8634101Z [Forecast] Skipping CRL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8634809Z [Forecast] Skipping CRM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8635533Z [Forecast] Skipping CRWD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8636261Z [Forecast] Skipping CSCO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8636992Z [Forecast] Skipping CSGP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8637708Z [Forecast] Skipping CSX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8638434Z [Forecast] Skipping CTAS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8639168Z [Forecast] Skipping CTRA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8639899Z [Forecast] Skipping CTSH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8640616Z [Forecast] Skipping CTVA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8641621Z [Forecast] Skipping CVS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8642359Z [Forecast] Skipping CVX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8643090Z [Forecast] Skipping CZR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8644043Z [Forecast] Skipping D: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8644747Z [Forecast] Skipping DAL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8645480Z [Forecast] Skipping DASH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8646209Z [Forecast] Skipping DAY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8646921Z [Forecast] Skipping DD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8647639Z [Forecast] Skipping DDOG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8648353Z [Forecast] Skipping DE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8649073Z [Forecast] Skipping DECK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8649802Z [Forecast] Skipping DELL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8650521Z [Forecast] Skipping DG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8651374Z [Forecast] Skipping DGX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8652101Z [Forecast] Skipping DHI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8652823Z [Forecast] Skipping DHR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8653538Z [Forecast] Skipping DIS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8654251Z [Forecast] Skipping DLR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8654983Z [Forecast] Skipping DLTR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8655711Z [Forecast] Skipping DOC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8656420Z [Forecast] Skipping DOV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8657127Z [Forecast] Skipping DOW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8657894Z [Forecast] Skipping DPZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8658609Z [Forecast] Skipping DRI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8659324Z [Forecast] Skipping DTE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8660045Z [Forecast] Skipping DUK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8660772Z [Forecast] Skipping DVA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8661658Z [Forecast] Skipping DVN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8662385Z [Forecast] Skipping DXCM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8663107Z [Forecast] Skipping EA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8663823Z [Forecast] Skipping EBAY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8664548Z [Forecast] Skipping ECL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8665251Z [Forecast] Skipping ED: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8665962Z [Forecast] Skipping EFX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8666664Z [Forecast] Skipping EG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8667371Z [Forecast] Skipping EIX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8668080Z [Forecast] Skipping EL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8668786Z [Forecast] Skipping ELV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8669700Z [Forecast] Skipping EMN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8670571Z [Forecast] Skipping EMR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8671446Z [Forecast] Skipping ENPH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8672172Z [Forecast] Skipping EOG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8672895Z [Forecast] Skipping EPAM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8673622Z [Forecast] Skipping EQIX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8674358Z [Forecast] Skipping EQR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8675077Z [Forecast] Skipping EQT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8675804Z [Forecast] Skipping ERIE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8676521Z [Forecast] Skipping ES: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8677229Z [Forecast] Skipping ESS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8677943Z [Forecast] Skipping ETN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8678664Z [Forecast] Skipping ETR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8679403Z [Forecast] Skipping EVRG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8680120Z [Forecast] Skipping EW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8680842Z [Forecast] Skipping EXC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8681704Z [Forecast] Skipping EXE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8682442Z [Forecast] Skipping EXPD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8683210Z [Forecast] Skipping EXPE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8683941Z [Forecast] Skipping EXR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8684648Z [Forecast] Skipping F: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8685365Z [Forecast] Skipping FANG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8686100Z [Forecast] Skipping FAST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8686822Z [Forecast] Skipping FCX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8687543Z [Forecast] Skipping FDS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8688260Z [Forecast] Skipping FDX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8688975Z [Forecast] Skipping FE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8689693Z [Forecast] Skipping FFIV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8690407Z [Forecast] Skipping FI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8691258Z [Forecast] Skipping FICO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8691992Z [Forecast] Skipping FIS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8692719Z [Forecast] Skipping FITB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8693437Z [Forecast] Skipping FOX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8694167Z [Forecast] Skipping FOXA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8694875Z [Forecast] Skipping FRT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8695585Z [Forecast] Skipping FSLR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8696325Z [Forecast] Skipping FTNT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8697047Z [Forecast] Skipping FTV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8697782Z [Forecast] Skipping GD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8699643Z [Forecast] Skipping GDDY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8700412Z [Forecast] Skipping GE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8701277Z [Forecast] Skipping GEHC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8702146Z [Forecast] Skipping GEN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8702863Z [Forecast] Skipping GEV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8703583Z [Forecast] Skipping GFS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8704307Z [Forecast] Skipping GILD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8705042Z [Forecast] Skipping GIS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8705743Z [Forecast] Skipping GL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8706648Z [Forecast] Skipping GLW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8707539Z [Forecast] Skipping GM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8708264Z [Forecast] Skipping GNRC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8708996Z [Forecast] Skipping GOOG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8709740Z [Forecast] Skipping GOOGL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8710484Z [Forecast] Skipping GPC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8711358Z [Forecast] Skipping GPN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8712092Z [Forecast] Skipping GRMN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8712802Z [Forecast] Skipping GS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8713515Z [Forecast] Skipping GWW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8714238Z [Forecast] Skipping HAL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8714954Z [Forecast] Skipping HAS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8715682Z [Forecast] Skipping HBAN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8716432Z [Forecast] Skipping HCA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8717157Z [Forecast] Skipping HD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8717890Z [Forecast] Skipping HIG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8718605Z [Forecast] Skipping HII: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8719312Z [Forecast] Skipping HLT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8720035Z [Forecast] Skipping HOLX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8720758Z [Forecast] Skipping HON: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8721620Z [Forecast] Skipping HPE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8722330Z [Forecast] Skipping HPQ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8723044Z [Forecast] Skipping HRL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8723767Z [Forecast] Skipping HSIC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8724487Z [Forecast] Skipping HST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8725200Z [Forecast] Skipping HSY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8725926Z [Forecast] Skipping HUBB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8726648Z [Forecast] Skipping HUM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8727357Z [Forecast] Skipping HWM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8728071Z [Forecast] Skipping IBM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8728774Z [Forecast] Skipping ICE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8729489Z [Forecast] Skipping IDXX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8730202Z [Forecast] Skipping IEX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8730913Z [Forecast] Skipping IFF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8731776Z [Forecast] Skipping INCY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8732497Z [Forecast] Skipping INTC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8733218Z [Forecast] Skipping INTU: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8733944Z [Forecast] Skipping INVH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8734663Z [Forecast] Skipping IP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8735369Z [Forecast] Skipping IPG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8736083Z [Forecast] Skipping IQV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8736790Z [Forecast] Skipping IR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8737497Z [Forecast] Skipping IRM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8738209Z [Forecast] Skipping ISRG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8738921Z [Forecast] Skipping IT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8739632Z [Forecast] Skipping ITW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8740350Z [Forecast] Skipping IVZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8741174Z [Forecast] Skipping J: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8741896Z [Forecast] Skipping JBHT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8742816Z [Forecast] Skipping JBL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8743685Z [Forecast] Skipping JCI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8744411Z [Forecast] Skipping JKHY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8745127Z [Forecast] Skipping JNJ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8745846Z [Forecast] Skipping JPM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8746592Z [Forecast] Skipping K: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8747299Z [Forecast] Skipping KDP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8748002Z [Forecast] Skipping KEY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8748733Z [Forecast] Skipping KEYS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8749454Z [Forecast] Skipping KHC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8750168Z [Forecast] Skipping KIM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8750878Z [Forecast] Skipping KKR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8751768Z [Forecast] Skipping KLAC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8752506Z [Forecast] Skipping KMB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8753221Z [Forecast] Skipping KMI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8754068Z [Forecast] Skipping KMX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8754777Z [Forecast] Skipping KO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8755476Z [Forecast] Skipping KR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8756201Z [Forecast] Skipping KVUE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8756911Z [Forecast] Skipping L: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8757624Z [Forecast] Skipping LDOS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8758349Z [Forecast] Skipping LEN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8759056Z [Forecast] Skipping LH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8759764Z [Forecast] Skipping LHX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8760464Z [Forecast] Skipping LII: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8761336Z [Forecast] Skipping LIN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8762050Z [Forecast] Skipping LKQ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8762764Z [Forecast] Skipping LLY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8763480Z [Forecast] Skipping LMT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8764192Z [Forecast] Skipping LNT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8764906Z [Forecast] Skipping LOW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8765629Z [Forecast] Skipping LRCX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8766355Z [Forecast] Skipping LULU: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8767065Z [Forecast] Skipping LUV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8767784Z [Forecast] Skipping LVS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8768503Z [Forecast] Skipping LW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8769212Z [Forecast] Skipping LYB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8769923Z [Forecast] Skipping LYV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8770631Z [Forecast] Skipping MA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8771492Z [Forecast] Skipping MAA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8772206Z [Forecast] Skipping MAR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8772921Z [Forecast] Skipping MAS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8773627Z [Forecast] Skipping MCD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8774345Z [Forecast] Skipping MCHP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8775065Z [Forecast] Skipping MCK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8775775Z [Forecast] Skipping MCO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8776485Z [Forecast] Skipping MDLZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8777196Z [Forecast] Skipping MDT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8777913Z [Forecast] Skipping MELI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8778805Z [Forecast] Skipping MET: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8779669Z [Forecast] Skipping META: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8780383Z [Forecast] Skipping MGM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8781278Z [Forecast] Skipping MHK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8782001Z [Forecast] Skipping MKC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8782720Z [Forecast] Skipping MKTX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8783434Z [Forecast] Skipping MLM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8784145Z [Forecast] Skipping MMC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8784854Z [Forecast] Skipping MMM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8785570Z [Forecast] Skipping MNST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8786268Z [Forecast] Skipping MO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8786970Z [Forecast] Skipping MOH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8787689Z [Forecast] Skipping MOS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8788405Z [Forecast] Skipping MPC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8789131Z [Forecast] Skipping MPWR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8789840Z [Forecast] Skipping MRK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8790558Z [Forecast] Skipping MRNA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8791455Z [Forecast] Skipping MRVL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8792171Z [Forecast] Skipping MS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8792879Z [Forecast] Skipping MSCI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8793605Z [Forecast] Skipping MSFT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8794324Z [Forecast] Skipping MSI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8795040Z [Forecast] Skipping MSTR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8795751Z [Forecast] Skipping MTB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8796477Z [Forecast] Skipping MTCH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8797198Z [Forecast] Skipping MTD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8797906Z [Forecast] Skipping MU: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8798617Z [Forecast] Skipping NCLH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8799333Z [Forecast] Skipping NDAQ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8800055Z [Forecast] Skipping NDSN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8800773Z [Forecast] Skipping NEE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8801623Z [Forecast] Skipping NEM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8802336Z [Forecast] Skipping NFLX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8803055Z [Forecast] Skipping NI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8803765Z [Forecast] Skipping NKE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8804481Z [Forecast] Skipping NOC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8805196Z [Forecast] Skipping NOW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8805913Z [Forecast] Skipping NRG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8806625Z [Forecast] Skipping NSC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8807344Z [Forecast] Skipping NTAP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8808069Z [Forecast] Skipping NTRS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8808784Z [Forecast] Skipping NUE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8809500Z [Forecast] Skipping NVDA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8810226Z [Forecast] Skipping NVR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8811076Z [Forecast] Skipping NWS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8811951Z [Forecast] Skipping NWSA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8812691Z [Forecast] Skipping NXPI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8813403Z [Forecast] Skipping O: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8814321Z [Forecast] Skipping ODFL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8815175Z [Forecast] Skipping OKE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8815892Z [Forecast] Skipping OMC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8816603Z [Forecast] Skipping ON: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8817327Z [Forecast] Skipping ORCL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8818052Z [Forecast] Skipping ORLY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8818768Z [Forecast] Skipping OTIS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8819491Z [Forecast] Skipping OXY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8820231Z [Forecast] Skipping PANW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8821121Z [Forecast] Skipping PAYC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8821859Z [Forecast] Skipping PAYX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8822593Z [Forecast] Skipping PCAR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8823322Z [Forecast] Skipping PCG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8824061Z [Forecast] Skipping PDD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8824786Z [Forecast] Skipping PEG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8825494Z [Forecast] Skipping PEP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8826213Z [Forecast] Skipping PFE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8826931Z [Forecast] Skipping PFG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8827643Z [Forecast] Skipping PG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8828349Z [Forecast] Skipping PGR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8829059Z [Forecast] Skipping PH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8829769Z [Forecast] Skipping PHM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8830483Z [Forecast] Skipping PKG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8831330Z [Forecast] Skipping PLD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8832065Z [Forecast] Skipping PLTR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8832787Z [Forecast] Skipping PM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8833503Z [Forecast] Skipping PNC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8834218Z [Forecast] Skipping PNR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8834923Z [Forecast] Skipping PNW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8835692Z [Forecast] Skipping PODD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8836424Z [Forecast] Skipping POOL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8837154Z [Forecast] Skipping PPG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8837864Z [Forecast] Skipping PPL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8838581Z [Forecast] Skipping PRU: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8839300Z [Forecast] Skipping PSA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8840025Z [Forecast] Skipping PSKY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8840742Z [Forecast] Skipping PSX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8841607Z [Forecast] Skipping PTC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8842336Z [Forecast] Skipping PWR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8843067Z [Forecast] Skipping PYPL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8843794Z [Forecast] Skipping QCOM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8844507Z [Forecast] Skipping RCL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8845220Z [Forecast] Skipping REG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8845944Z [Forecast] Skipping REGN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8846659Z [Forecast] Skipping RF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8847366Z [Forecast] Skipping RJF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8848076Z [Forecast] Skipping RL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8848785Z [Forecast] Skipping RMD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8849496Z [Forecast] Skipping ROK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8850443Z [Forecast] Skipping ROL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8851439Z [Forecast] Skipping ROP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8852168Z [Forecast] Skipping ROST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8852889Z [Forecast] Skipping RSG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8853621Z [Forecast] Skipping RTX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8854337Z [Forecast] Skipping RVTY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8855064Z [Forecast] Skipping SBAC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8855792Z [Forecast] Skipping SBUX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8856515Z [Forecast] Skipping SCHW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8857235Z [Forecast] Skipping SHOP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8857957Z [Forecast] Skipping SHW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8858673Z [Forecast] Skipping SJM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8859392Z [Forecast] Skipping SLB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8860126Z [Forecast] Skipping SMCI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8860839Z [Forecast] Skipping SNA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8861707Z [Forecast] Skipping SNPS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8862429Z [Forecast] Skipping SO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8863151Z [Forecast] Skipping SOLV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8863865Z [Forecast] Skipping SPG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8864713Z [Forecast] Skipping SPGI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8865431Z [Forecast] Skipping SRE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8866149Z [Forecast] Skipping STE: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8866864Z [Forecast] Skipping STLD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8867579Z [Forecast] Skipping STT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8868306Z [Forecast] Skipping STX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8869024Z [Forecast] Skipping STZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8869733Z [Forecast] Skipping SW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8870430Z [Forecast] Skipping SWK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8871379Z [Forecast] Skipping SWKS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8872110Z [Forecast] Skipping SYF: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8872824Z [Forecast] Skipping SYK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8873588Z [Forecast] Skipping SYY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8874292Z [Forecast] Skipping T: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8874998Z [Forecast] Skipping TAP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8875713Z [Forecast] Skipping TDG: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8876423Z [Forecast] Skipping TDY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8877150Z [Forecast] Skipping TEAM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8877892Z [Forecast] Skipping TECH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8878621Z [Forecast] Skipping TEL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8879336Z [Forecast] Skipping TER: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8880045Z [Forecast] Skipping TFC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8880765Z [Forecast] Skipping TGT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8881689Z [Forecast] Skipping TJX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8882132Z [Forecast] Skipping TKO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8882541Z [Forecast] Skipping TMO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8882961Z [Forecast] Skipping TMUS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8883377Z [Forecast] Skipping TPL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8883786Z [Forecast] Skipping TPR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8884203Z [Forecast] Skipping TRGP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8884807Z [Forecast] Skipping TRI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8885340Z [Forecast] Skipping TRMB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8885758Z [Forecast] Skipping TROW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8886164Z [Forecast] Skipping TRV: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8886566Z [Forecast] Skipping TSCO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8886983Z [Forecast] Skipping TSLA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8887394Z [Forecast] Skipping TSN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8887804Z [Forecast] Skipping TT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8888223Z [Forecast] Skipping TTD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8888657Z [Forecast] Skipping TTWO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8889078Z [Forecast] Skipping TXN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8889485Z [Forecast] Skipping TXT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8889893Z [Forecast] Skipping TYL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8890293Z [Forecast] Skipping UAL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8890699Z [Forecast] Skipping UBER: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8891334Z [Forecast] Skipping UDR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8891752Z [Forecast] Skipping UHS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8892156Z [Forecast] Skipping ULTA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8892560Z [Forecast] Skipping UNH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8892966Z [Forecast] Skipping UNP: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8893374Z [Forecast] Skipping UPS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8893769Z [Forecast] Skipping URI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8894176Z [Forecast] Skipping USB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8894572Z [Forecast] Skipping V: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8894981Z [Forecast] Skipping VICI: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8895393Z [Forecast] Skipping VLO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8895793Z [Forecast] Skipping VLTO: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8896199Z [Forecast] Skipping VMC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8896610Z [Forecast] Skipping VRSK: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8897021Z [Forecast] Skipping VRSN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8897426Z [Forecast] Skipping VRTX: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8897832Z [Forecast] Skipping VST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8898234Z [Forecast] Skipping VTR: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8898641Z [Forecast] Skipping VTRS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8899042Z [Forecast] Skipping VZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8899443Z [Forecast] Skipping WAB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8899855Z [Forecast] Skipping WAT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8900261Z [Forecast] Skipping WBA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8900661Z [Forecast] Skipping WBD: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8901255Z [Forecast] Skipping WDAY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8901672Z [Forecast] Skipping WDC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8902079Z [Forecast] Skipping WEC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8902485Z [Forecast] Skipping WELL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8902882Z [Forecast] Skipping WFC: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8903286Z [Forecast] Skipping WM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8903684Z [Forecast] Skipping WMB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8904088Z [Forecast] Skipping WMT: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8904483Z [Forecast] Skipping WRB: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8905027Z [Forecast] Skipping WSM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8905552Z [Forecast] Skipping WST: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8905957Z [Forecast] Skipping WTW: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8906356Z [Forecast] Skipping WY: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8906873Z [Forecast] Skipping WYNN: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8907283Z [Forecast] Skipping XEL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8907683Z [Forecast] Skipping XOM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8908085Z [Forecast] Skipping XYL: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8908484Z [Forecast] Skipping XYZ: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8908884Z [Forecast] Skipping YUM: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8909282Z [Forecast] Skipping ZBH: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8909689Z [Forecast] Skipping ZBRA: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8910092Z [Forecast] Skipping ZS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8910495Z [Forecast] Skipping ZTS: insufficient history (0 days)
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8910813Z   Generated 0 forecasts
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8911614Z [Latest] Fallback published to /home/runner/work/rubikvault-site/rubikvault-site/public/data/forecast/latest.json
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8912498Z [Status] Updated /home/runner/work/rubikvault-site/rubikvault-site/public/data/forecast/system/status.json
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.8913045Z   Pipeline degraded. Published last_good.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9018933Z ##[group]Run actions/upload-artifact@v4
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9019290Z with:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9019482Z   name: forecast-daily-log
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9019719Z   path: pipeline.log
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9019925Z   retention-days: 30
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9020126Z   if-no-files-found: warn
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9020351Z   compression-level: 6
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9020554Z   overwrite: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9020743Z   include-hidden-files: false
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9021205Z env:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9021385Z   NODE_VERSION: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9021572Z   OMP_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9021759Z   MKL_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9021946Z   OPENBLAS_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:31.9022143Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.1457693Z With the provided path, there will be 1 file uploaded
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.1471759Z Artifact name is valid!
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.1473326Z Root directory input is valid!
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.4625140Z Beginning upload of artifact content to blob storage
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.7782563Z Uploaded bytes 2465
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.8657200Z Finished uploading artifact content to blob storage!
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.8659418Z SHA256 digest of uploaded artifact zip is f8b5c90b4808f519ee4dece0f988acd762737c76d29df3b2a11e2577d0e1735e
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:32.8661447Z Finalizing artifact upload
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0225644Z Artifact forecast-daily-log.zip successfully finalized. Artifact ID 5456391833
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0227369Z Artifact forecast-daily-log has been successfully uploaded! Final size is 2465 bytes. Artifact ID is 5456391833
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0235199Z Artifact download URL: https://github.com/RubikVault/rubikvault-site/actions/runs/21883339643/artifacts/5456391833
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0340062Z ##[group]Run echo "## Forecast Daily Pipeline" >> $GITHUB_STEP_SUMMARY
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0340559Z [36;1mecho "## Forecast Daily Pipeline" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0340908Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0341511Z [36;1mif [ "failed" == "success" ]; then[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0341891Z [36;1m  echo "✅ Pipeline completed successfully" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0342254Z [36;1melse[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0342502Z [36;1m  echo "❌ Pipeline failed" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0342794Z [36;1mfi[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0342985Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0343365Z [36;1mecho "See pipeline.log artifact for details." >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0374951Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0375464Z env:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0375643Z   NODE_VERSION: 20
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0375887Z   OMP_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0376084Z   MKL_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0376271Z   OPENBLAS_NUM_THREADS: 1
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0376485Z ##[endgroup]
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.0493528Z Post job cleanup.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.2092157Z Cache hit occurred on the primary key node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b, not saving cache.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.2199786Z Post job cleanup.
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3271770Z [command]/usr/bin/git version
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3310735Z git version 2.52.0
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3356028Z Temporarily overriding HOME='/home/runner/work/_temp/999e8a7a-ecbe-478f-a2c3-fb9d15e5784a' before making global git config changes
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3357129Z Adding repository directory to the temporary git global config as a safe directory
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3362747Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3401175Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3435809Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3670729Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3694323Z http.https://github.com/.extraheader
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3707235Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3739755Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.3974970Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.4008550Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Daily Forecast Run	UNKNOWN STEP	2026-02-10T21:37:33.4346788Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Forecast Monthly Report
```
latest_run_id=NONE -> auto_repro_attempt
```

### WORKFLOW: Forecast Weekly Training
```
latest_run_id=21793741108
Weekly Challenger Training	UNKNOWN STEP	﻿2026-02-08T06:35:04.8149654Z Current runner version: '2.331.0'
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8180284Z ##[group]Runner Image Provisioner
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8181098Z Hosted Compute Agent
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8181668Z Version: 20260123.484
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8182216Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8183333Z Build Date: 2026-01-23T19:41:17Z
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8183998Z Worker ID: {c276e84f-3736-492e-8769-74a09293e669}
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8184672Z Azure Region: northcentralus
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8185486Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8187767Z ##[group]Operating System
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8188753Z Ubuntu
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8189496Z 24.04.3
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8190425Z LTS
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8191220Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8192139Z ##[group]Runner Image
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8193501Z Image: ubuntu-24.04
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8194375Z Version: 20260201.15.1
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8196460Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8198983Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8200425Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8204646Z ##[group]GITHUB_TOKEN Permissions
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8206734Z Actions: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8207491Z ArtifactMetadata: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8208084Z Attestations: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8208557Z Checks: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8209169Z Contents: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8209681Z Deployments: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8210375Z Discussions: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8210878Z Issues: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8211454Z Metadata: read
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8211941Z Models: read
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8212744Z Packages: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8213305Z Pages: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8213914Z PullRequests: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8214549Z RepositoryProjects: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8215174Z SecurityEvents: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8215731Z Statuses: write
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8216240Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8219045Z Secret source: Actions
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8220087Z Prepare workflow directory
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8790679Z Prepare all required actions
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:04.8845246Z Getting action download info
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.1894890Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.2749124Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.3684308Z Download action repository 'actions/upload-artifact@v4' (SHA:ea165f8d65b6e75b540449e92b4886f43607fa02)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.5763301Z Complete job name: Weekly Challenger Training
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6461226Z ##[group]Run actions/checkout@v4
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6462141Z with:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6462692Z   fetch-depth: 1
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6463135Z   repository: RubikVault/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6463811Z   token: ***
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6464197Z   ssh-strict: true
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6464578Z   ssh-user: git
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6464995Z   persist-credentials: true
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6465443Z   clean: true
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6465845Z   sparse-checkout-cone-mode: true
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6466323Z   fetch-tags: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6466724Z   show-progress: true
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6467126Z   lfs: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6467487Z   submodules: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6467894Z   set-safe-directory: true
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6468571Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6468943Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.6469328Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7525726Z Syncing repository: RubikVault/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7527553Z ##[group]Getting Git version info
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7528401Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7529490Z [command]/usr/bin/git version
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7595180Z git version 2.52.0
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7620746Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7635314Z Temporarily overriding HOME='/home/runner/work/_temp/895c237e-c391-413a-82ae-00ad413159fe' before making global git config changes
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7636939Z Adding repository directory to the temporary git global config as a safe directory
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7647958Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7686466Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7689955Z ##[group]Initializing the repository
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7694243Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7792739Z hint: Using 'master' as the name for the initial branch. This default branch name
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7794209Z hint: will change to "main" in Git 3.0. To configure the initial branch name
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7795865Z hint: to use in all of your new repositories, which will suppress this warning,
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7797314Z hint: call:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7797981Z hint:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7798791Z hint: 	git config --global init.defaultBranch <name>
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7799538Z hint:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7800133Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7801127Z hint: 'development'. The just-created branch can be renamed via this command:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7801910Z hint:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7802494Z hint: 	git branch -m <name>
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7803043Z hint:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7803633Z hint: Disable this message with "git config set advice.defaultBranchName false"
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7804662Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7814096Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7848870Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7850056Z ##[group]Disabling automatic garbage collection
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7854091Z [command]/usr/bin/git config --local gc.auto 0
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7882941Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7884110Z ##[group]Setting up auth
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7890450Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.7920922Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8264764Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8301697Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8545146Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8580753Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8839413Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8873743Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8874970Z ##[group]Fetching the repository
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:35:05.8883657Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +ed5b407c5c853cbd087c2bfbe0693dc0e507e12d:refs/remotes/origin/main
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6779904Z From https://github.com/RubikVault/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6780953Z  * [new ref]         ed5b407c5c853cbd087c2bfbe0693dc0e507e12d -> origin/main
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6818915Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6819421Z ##[group]Determining the checkout info
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6821164Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6827192Z [command]/usr/bin/git sparse-checkout disable
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6867138Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6891668Z ##[group]Checking out the ref
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:36.6897019Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:37.7378868Z Updating files:  49% (807/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:37.7986399Z Updating files:  50% (819/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:37.8597458Z Updating files:  51% (835/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:37.9263494Z Updating files:  52% (852/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:37.9786725Z Updating files:  53% (868/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.0442000Z Updating files:  54% (884/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.0862992Z Updating files:  55% (901/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.1469889Z Updating files:  56% (917/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.1934131Z Updating files:  57% (934/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.2472934Z Updating files:  58% (950/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.3244139Z Updating files:  59% (966/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.3757911Z Updating files:  60% (983/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.4321288Z Updating files:  61% (999/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.4856003Z Updating files:  62% (1015/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.5457689Z Updating files:  63% (1032/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.6050478Z Updating files:  64% (1048/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.6498803Z Updating files:  65% (1065/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7055649Z Updating files:  66% (1081/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7225045Z Updating files:  66% (1093/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7711820Z Updating files:  67% (1097/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7723025Z Updating files:  68% (1114/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7730984Z Updating files:  69% (1130/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7745487Z Updating files:  70% (1146/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7753402Z Updating files:  71% (1163/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7760760Z Updating files:  72% (1179/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7768254Z Updating files:  73% (1196/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7776455Z Updating files:  74% (1212/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7788161Z Updating files:  75% (1228/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7799935Z Updating files:  76% (1245/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7809858Z Updating files:  77% (1261/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7822953Z Updating files:  78% (1277/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7837341Z Updating files:  79% (1294/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7843165Z Updating files:  80% (1310/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7850704Z Updating files:  81% (1326/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7862690Z Updating files:  82% (1343/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7875089Z Updating files:  83% (1359/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7884182Z Updating files:  84% (1376/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7895275Z Updating files:  85% (1392/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7906699Z Updating files:  86% (1408/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7916658Z Updating files:  87% (1425/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7925036Z Updating files:  88% (1441/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7935552Z Updating files:  89% (1457/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7943463Z Updating files:  90% (1474/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7953081Z Updating files:  91% (1490/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7964864Z Updating files:  92% (1507/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7971085Z Updating files:  93% (1523/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7983417Z Updating files:  94% (1539/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.7995272Z Updating files:  95% (1556/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8003479Z Updating files:  96% (1572/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8015020Z Updating files:  97% (1588/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8035686Z Updating files:  98% (1605/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8042949Z Updating files:  99% (1621/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8043663Z Updating files: 100% (1637/1637)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8044126Z Updating files: 100% (1637/1637), done.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8070416Z Switched to a new branch 'main'
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8073921Z branch 'main' set up to track 'origin/main'.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8189289Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8233594Z [command]/usr/bin/git log -1 --format=%H
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8257319Z ed5b407c5c853cbd087c2bfbe0693dc0e507e12d
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8508658Z ##[group]Run actions/setup-node@v4
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8508914Z with:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8509080Z   node-version: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8509256Z   cache: npm
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8509422Z   always-auth: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8509603Z   check-latest: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8509917Z   token: ***
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8510267Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8510421Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:38.8510589Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:39.0316452Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:39.0323233Z ##[group]Environment details
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:40.6303778Z node: v20.20.0
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:40.6304203Z npm: 10.8.2
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:40.6304444Z yarn: 1.22.22
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:40.6307451Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:40.6328520Z [command]/opt/hostedtoolcache/node/20.20.0/x64/bin/npm config get cache
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:40.9318709Z /home/runner/.npm
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:41.1286982Z Cache hit for: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:41.9068395Z Received 69391852 of 69391852 (100.0%), 101.3 MBs/sec
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:41.9069548Z Cache Size: ~66 MB (69391852 B)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:41.9132215Z [command]/usr/bin/tar -xf /home/runner/work/_temp/59f8fe93-ab8f-45ba-bcc6-a3c42c0efbbd/cache.tzst -P -C /home/runner/work/rubikvault-site/rubikvault-site --use-compress-program unzstd
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0407770Z Cache restored successfully
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0557381Z Cache restored from key: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0710683Z ##[group]Run npm ci --prefer-offline
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0711037Z [36;1mnpm ci --prefer-offline[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0756073Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0756403Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0756575Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:42.0756778Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:44.5699196Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:44.6195199Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:45.4786196Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.0702080Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.0703140Z added 106 packages, and audited 107 packages in 4s
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.0703575Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.0703797Z 18 packages are looking for funding
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.0704097Z   run `npm fund` for details
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1378931Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1379914Z 6 vulnerabilities (2 moderate, 4 high)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1380485Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1380984Z To address all issues (including breaking changes), run:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1381797Z   npm audit fix --force
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1382135Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1382718Z Run `npm audit` for details.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1699577Z ##[group]Run DATE_ARG=""
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1699871Z [36;1mDATE_ARG=""[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1700076Z [36;1mif [ -n "" ]; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1700299Z [36;1m  DATE_ARG="--date="[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1700505Z [36;1mfi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1700679Z [36;1m[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1700991Z [36;1mnode scripts/forecast/run_weekly.mjs $DATE_ARG 2>&1 | tee pipeline.log[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1701371Z [36;1m[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1701549Z [36;1m# Extract promotion status[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1701850Z [36;1mif grep -q "Promotion: YES" pipeline.log; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1702177Z [36;1m  echo "promoted=true" >> $GITHUB_OUTPUT[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1702817Z [36;1m  NEW_CHAMPION=$(grep "New champion:" pipeline.log | awk '{print $NF}')[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1703251Z [36;1m  echo "new_champion=$NEW_CHAMPION" >> $GITHUB_OUTPUT[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1703544Z [36;1melse[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1703786Z [36;1m  echo "promoted=false" >> $GITHUB_OUTPUT[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1704053Z [36;1mfi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1704214Z [36;1m[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1704461Z [36;1mif grep -q "WEEKLY PIPELINE COMPLETE" pipeline.log; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1704813Z [36;1m  echo "status=success" >> $GITHUB_OUTPUT[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1705237Z [36;1melse[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1705435Z [36;1m  echo "status=failed" >> $GITHUB_OUTPUT[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1705682Z [36;1mfi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1739228Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1739545Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1739713Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1739894Z   TZ: America/New_York
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.1740079Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2150780Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2151766Z ═══════════════════════════════════════════════════════════════
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2155556Z   FORECAST SYSTEM v3.0 — WEEKLY PIPELINE
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2156538Z ═══════════════════════════════════════════════════════════════
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2156835Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2157089Z [Step 1] Loading policy and champion spec...
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2163197Z   Policy: rv-forecast v3.0.0
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.2163770Z   Champion: v3.0-champion-0001
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4950487Z   Trading Date: 2026-02-06
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4950795Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4951109Z [Step 2] Generating challenger specs...
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4954636Z [Challenger] Generating challengers for 2026-02-06
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4955274Z   Parent champion: v3.0-champion-0001
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4955755Z   Max challengers: 4
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4960585Z   Possible actions: 15
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4963008Z   Generated 4 challenger specs
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4968610Z [Challenger] Written /home/runner/work/rubikvault-site/rubikvault-site/mirrors/forecast/challengers/specs/2026-02-06_feature_ablation_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4970889Z [Challenger] Written /home/runner/work/rubikvault-site/rubikvault-site/mirrors/forecast/challengers/specs/2026-02-06_calibration_change_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4973462Z [Challenger] Written /home/runner/work/rubikvault-site/rubikvault-site/mirrors/forecast/challengers/specs/2026-02-06_neutral_band_adjustment_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4975776Z [Challenger] Written /home/runner/work/rubikvault-site/rubikvault-site/mirrors/forecast/challengers/specs/2026-02-06_model_family_change_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4976866Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4977161Z [Step 3] Loading recent outcomes...
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4977782Z   Loaded 0 live outcomes (30d)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4978093Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4978377Z [Step 4] Running promotion evaluation...
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4981897Z [Promotion] Running promotion evaluation...
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4983041Z   Champion: v3.0-champion-0001
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4983523Z   Challengers: 4
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4983908Z   Outcomes: 0
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4984296Z   Primary bucket: normal_days
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4985311Z   Champion skill: 0.0000
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4988652Z   ✗ 2026-02-06_feature_ablation_fou8 FAILED: INSUFFICIENT_SAMPLES: 0 < 300, SKILL_TOO_LOW: 0.00% < 1%
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4990291Z   ✗ 2026-02-06_calibration_change_fou8 FAILED: INSUFFICIENT_SAMPLES: 0 < 300, SKILL_TOO_LOW: 0.00% < 1%
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4991877Z   ✗ 2026-02-06_neutral_band_adjustment_fou8 FAILED: INSUFFICIENT_SAMPLES: 0 < 300, SKILL_TOO_LOW: 0.00% < 1%
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4993725Z   ✗ 2026-02-06_model_family_change_fou8 FAILED: INSUFFICIENT_SAMPLES: 0 < 300, SKILL_TOO_LOW: 0.00% < 1%
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4994457Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4994761Z   No challenger passed gates. Champion retained.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4995166Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4995769Z ═══════════════════════════════════════════════════════════════
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4996351Z   WEEKLY PIPELINE COMPLETE
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4996795Z   Challengers tested: 4
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4997165Z   Promotion: NO
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4997898Z ═══════════════════════════════════════════════════════════════
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.4998269Z 
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5116857Z ##[group]Run git config user.name "github-actions[bot]"
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5117257Z [36;1mgit config user.name "github-actions[bot]"[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5117657Z [36;1mgit config user.email "github-actions[bot]@users.noreply.github.com"[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5118012Z [36;1m[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5118221Z [36;1m# Add challenger specs and any promotions[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5118755Z [36;1mgit add mirrors/forecast/challengers/ || true[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5119069Z [36;1mgit add mirrors/forecast/champion/ || true[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5119399Z [36;1mgit add mirrors/forecast/ledger/promotions/ || true[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5119724Z [36;1mgit add public/data/forecast/ || true[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5119973Z [36;1m[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5120144Z [36;1m# Check if there are changes[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5120405Z [36;1mif git diff --staged --quiet; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5120666Z [36;1m  echo "No changes to commit"[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5120925Z [36;1melse[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5121201Z [36;1m  COMMIT_MSG="chore(forecast): weekly training $(date +%Y-%m-%d)"[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5121543Z [36;1m  if [ "false" == "true" ]; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5121822Z [36;1m    COMMIT_MSG="feat(forecast): promoted "[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5122081Z [36;1m  fi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5122261Z [36;1m  git commit -m "$COMMIT_MSG"[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5122731Z [36;1m  git push[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5122911Z [36;1mfi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5155560Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5155873Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5156040Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:46.5156219Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2063735Z warning: could not open directory 'mirrors/forecast/ledger/promotions/': No such file or directory
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2064969Z fatal: pathspec 'mirrors/forecast/ledger/promotions/' did not match any files
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2200552Z [main f18e6ab] chore(forecast): weekly training 2026-02-08
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2200992Z  4 files changed, 107 insertions(+)
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2201492Z  create mode 100644 mirrors/forecast/challengers/specs/2026-02-06_calibration_change_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2202175Z  create mode 100644 mirrors/forecast/challengers/specs/2026-02-06_feature_ablation_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2203108Z  create mode 100644 mirrors/forecast/challengers/specs/2026-02-06_model_family_change_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.2203807Z  create mode 100644 mirrors/forecast/challengers/specs/2026-02-06_neutral_band_adjustment_fou8.json
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7386888Z To https://github.com/RubikVault/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7387548Z    ed5b407..f18e6ab  main -> main
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7496135Z ##[group]Run actions/upload-artifact@v4
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7496421Z with:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7496611Z   name: forecast-weekly-log
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7496835Z   path: pipeline.log
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7497040Z   retention-days: 30
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7497254Z   if-no-files-found: warn
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7497471Z   compression-level: 6
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7497672Z   overwrite: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7497897Z   include-hidden-files: false
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7498116Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7498277Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.7498463Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.9639120Z With the provided path, there will be 1 file uploaded
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.9645241Z Artifact name is valid!
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:47.9646263Z Root directory input is valid!
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.0936881Z Beginning upload of artifact content to blob storage
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.2155504Z Uploaded bytes 743
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.2478854Z Finished uploading artifact content to blob storage!
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.2482125Z SHA256 digest of uploaded artifact zip is d747da52be3a1d420d52ffcc2634ac582e324ca64da6371475984ecd8a0c0b57
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.2483591Z Finalizing artifact upload
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3794169Z Artifact forecast-weekly-log.zip successfully finalized. Artifact ID 5421115819
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3795638Z Artifact forecast-weekly-log has been successfully uploaded! Final size is 743 bytes. Artifact ID is 5421115819
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3802825Z Artifact download URL: https://github.com/RubikVault/rubikvault-site/actions/runs/21793741108/artifacts/5421115819
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3909909Z ##[group]Run echo "## Forecast Weekly Training" >> $GITHUB_STEP_SUMMARY
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3910951Z [36;1mecho "## Forecast Weekly Training" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3911543Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3912038Z [36;1mif [ "success" == "success" ]; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3912962Z [36;1m  echo "✅ Pipeline completed successfully" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3913609Z [36;1melse[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3914144Z [36;1m  echo "❌ Pipeline failed" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3914769Z [36;1mfi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3915063Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3915539Z [36;1mif [ "false" == "true" ]; then[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3916058Z [36;1m  echo "🎉 **New Champion Promoted:** " >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3916661Z [36;1melse[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3917178Z [36;1m  echo "📊 No promotion this week" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3917810Z [36;1mfi[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3918167Z [36;1mecho "" >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3918881Z [36;1mecho "See pipeline.log artifact for details." >> $GITHUB_STEP_SUMMARY[0m
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3965658Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3966226Z env:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3966522Z   NODE_VERSION: 20
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.3966843Z ##[endgroup]
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.4097946Z Post job cleanup.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.5601209Z Cache hit occurred on the primary key node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b, not saving cache.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.5727322Z Post job cleanup.
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6679213Z [command]/usr/bin/git version
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6714943Z git version 2.52.0
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6759669Z Temporarily overriding HOME='/home/runner/work/_temp/364a8529-11cf-49c4-acc1-0fd09b0a15ed' before making global git config changes
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6761211Z Adding repository directory to the temporary git global config as a safe directory
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6766547Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6802551Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.6835175Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7067738Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7091409Z http.https://github.com/.extraheader
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7104819Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7135577Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7358054Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7388520Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
Weekly Challenger Training	UNKNOWN STEP	2026-02-08T06:37:48.7712044Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: CI Determinism Check
```
latest_run_id=21829656537
determinism-check	UNKNOWN STEP	﻿2026-02-09T14:47:02.9011181Z Current runner version: '2.331.0'
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9033423Z ##[group]Runner Image Provisioner
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9034204Z Hosted Compute Agent
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9034771Z Version: 20260123.484
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9035380Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9036182Z Build Date: 2026-01-23T19:41:17Z
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9036805Z Worker ID: {4e1d51a4-4baa-408a-8442-7324fe47b451}
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9037884Z Azure Region: westus
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9038471Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9039857Z ##[group]Operating System
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9040549Z Ubuntu
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9041042Z 24.04.3
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9041497Z LTS
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9041903Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9042473Z ##[group]Runner Image
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9043023Z Image: ubuntu-24.04
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9043480Z Version: 20260201.15.1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9044718Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9046609Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9047888Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9050653Z ##[group]GITHUB_TOKEN Permissions
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9052734Z Actions: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9053339Z ArtifactMetadata: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9053857Z Attestations: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9054465Z Checks: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9054972Z Contents: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9055444Z Deployments: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9056080Z Discussions: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9056546Z Issues: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9057066Z Metadata: read
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9057744Z Models: read
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9058252Z Packages: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9058725Z Pages: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9059352Z PullRequests: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9059955Z RepositoryProjects: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9060496Z SecurityEvents: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9061067Z Statuses: write
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9061563Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9063522Z Secret source: Actions
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9064174Z Prepare workflow directory
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9439265Z Prepare all required actions
determinism-check	UNKNOWN STEP	2026-02-09T14:47:02.9484261Z Getting action download info
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.4237427Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.5210040Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7032798Z Complete job name: determinism-check
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7705156Z ##[group]Run actions/checkout@v4
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7705989Z with:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7706406Z   repository: RubikVault/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7707261Z   token: ***
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7707658Z   ssh-strict: true
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7708059Z   ssh-user: git
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7708458Z   persist-credentials: true
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7708905Z   clean: true
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7709308Z   sparse-checkout-cone-mode: true
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7709792Z   fetch-depth: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7710196Z   fetch-tags: false
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7710590Z   show-progress: true
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7710999Z   lfs: false
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7711363Z   submodules: false
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7711790Z   set-safe-directory: true
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7712471Z env:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7712845Z   OMP_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7713447Z   MKL_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7714021Z   OPENBLAS_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.7714456Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8782274Z Syncing repository: RubikVault/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8784552Z ##[group]Getting Git version info
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8785347Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8786371Z [command]/usr/bin/git version
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8885148Z git version 2.52.0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8912000Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8933565Z Temporarily overriding HOME='/home/runner/work/_temp/fde8df3a-a5e3-4bab-b35a-37ed108c42b2' before making global git config changes
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8936254Z Adding repository directory to the temporary git global config as a safe directory
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8940209Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8981958Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8985600Z ##[group]Initializing the repository
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.8990825Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9118295Z hint: Using 'master' as the name for the initial branch. This default branch name
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9119758Z hint: will change to "main" in Git 3.0. To configure the initial branch name
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9120804Z hint: to use in all of your new repositories, which will suppress this warning,
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9121523Z hint: call:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9121897Z hint:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9122639Z hint: 	git config --global init.defaultBranch <name>
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9123568Z hint:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9124150Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9125730Z hint: 'development'. The just-created branch can be renamed via this command:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9127032Z hint:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9128026Z hint: 	git branch -m <name>
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9128825Z hint:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9129907Z hint: Disable this message with "git config set advice.defaultBranchName false"
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9131822Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9137434Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9172697Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9173900Z ##[group]Disabling automatic garbage collection
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9177879Z [command]/usr/bin/git config --local gc.auto 0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9205768Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9206973Z ##[group]Setting up auth
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9213276Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9243819Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9615400Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9648242Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9884563Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:03.9917806Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
determinism-check	UNKNOWN STEP	2026-02-09T14:47:04.0162057Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
determinism-check	UNKNOWN STEP	2026-02-09T14:47:04.0195349Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:04.0196313Z ##[group]Fetching the repository
determinism-check	UNKNOWN STEP	2026-02-09T14:47:04.0204391Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +166a15246fc75b11da12b0f8504ef8fb77a01229:refs/remotes/origin/main
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2068015Z From https://github.com/RubikVault/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2070038Z  * [new ref]         166a15246fc75b11da12b0f8504ef8fb77a01229 -> origin/main
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2102894Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2104836Z ##[group]Determining the checkout info
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2106964Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2111343Z [command]/usr/bin/git sparse-checkout disable
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2153866Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2184160Z ##[group]Checking out the ref
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.2186185Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3308716Z Switched to a new branch 'main'
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3310653Z branch 'main' set up to track 'origin/main'.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3326442Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3364386Z [command]/usr/bin/git log -1 --format=%H
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3386230Z 166a15246fc75b11da12b0f8504ef8fb77a01229
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3702781Z ##[group]Run actions/setup-node@v4
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3703965Z with:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3704775Z   node-version: 20
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3705650Z   cache: npm
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3706484Z   always-auth: false
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3707557Z   check-latest: false
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3708787Z   token: ***
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3709592Z env:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3710379Z   OMP_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3711292Z   MKL_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3712225Z   OPENBLAS_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.3713201Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.5614737Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.5621145Z ##[group]Environment details
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.9325233Z node: v20.20.0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.9325710Z npm: 10.8.2
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.9325993Z yarn: 1.22.22
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.9326627Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:05.9348860Z [command]/opt/hostedtoolcache/node/20.20.0/x64/bin/npm config get cache
determinism-check	UNKNOWN STEP	2026-02-09T14:47:06.0514642Z /home/runner/.npm
determinism-check	UNKNOWN STEP	2026-02-09T14:47:06.4031829Z Cache hit for: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
determinism-check	UNKNOWN STEP	2026-02-09T14:47:07.7323675Z Received 0 of 69391852 (0.0%), 0.0 MBs/sec
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.6487643Z Received 69391852 of 69391852 (100.0%), 34.5 MBs/sec
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.6488492Z Cache Size: ~66 MB (69391852 B)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.6518780Z [command]/usr/bin/tar -xf /home/runner/work/_temp/b4e6401a-ff4c-49db-ad60-08a144dcbf6c/cache.tzst -P -C /home/runner/work/rubikvault-site/rubikvault-site --use-compress-program unzstd
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.7945586Z Cache restored successfully
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8097496Z Cache restored from key: node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8243278Z ##[group]Run npm ci
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8243589Z [36;1mnpm ci[0m
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8288548Z shell: /usr/bin/bash -e {0}
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8288817Z env:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8289000Z   OMP_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8289209Z   MKL_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8289416Z   OPENBLAS_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:08.8289633Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:10.4846817Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:10.5400989Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.4201622Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.8945071Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.8946579Z added 106 packages, and audited 107 packages in 5s
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.8947293Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.8947622Z 18 packages are looking for funding
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.8948142Z   run `npm fund` for details
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9546169Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9546856Z 6 vulnerabilities (2 moderate, 4 high)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9547447Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9547856Z To address all issues (including breaking changes), run:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9548472Z   npm audit fix --force
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9548729Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9548931Z Run `npm audit` for details.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9938375Z ##[group]Run npm run test:determinism
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9938710Z [36;1mnpm run test:determinism[0m
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9971640Z shell: /usr/bin/bash -e {0}
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9971874Z env:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9972042Z   OMP_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9972242Z   MKL_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9972472Z   OPENBLAS_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:13.9972886Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1071432Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1071905Z > test:determinism
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1072707Z > node --test tests/determinism/forecast-determinism.test.mjs
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1073234Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1426642Z TAP version 13
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1710247Z # Determinism tests completed successfully
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1881191Z # Subtest: Forecast Determinism (MEM v1.2)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1884691Z     # Subtest: should derive consistent direction from p_up
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1899433Z     ok 1 - should derive consistent direction from p_up
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1900336Z       ---
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1907867Z       duration_ms: 0.859473
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1908280Z       ...
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1909367Z     # Subtest: should produce identical results for same inputs (determinism)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1911644Z     ok 2 - should produce identical results for same inputs (determinism)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1912427Z       ---
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1912804Z       duration_ms: 0.227044
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1913188Z       ...
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1916607Z     # Subtest: should maintain order stability in sorting
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1918710Z     ok 3 - should maintain order stability in sorting
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1919517Z       ---
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1919821Z       duration_ms: 7.664887
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1920175Z       ...
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1925772Z     # Subtest: should validate probability ranges
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1927682Z     ok 4 - should validate probability ranges
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1928501Z       ---
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1928820Z       duration_ms: 0.244396
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1929196Z       ...
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1930944Z     1..4
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1934830Z ok 1 - Forecast Determinism (MEM v1.2)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1935683Z   ---
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1935997Z   duration_ms: 10.289301
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.1936361Z   type: 'suite'
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2016985Z   ...
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2017414Z 1..1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2018081Z # tests 4
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2018924Z # suites 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2019700Z # pass 4
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2020484Z # fail 0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2021291Z # cancelled 0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2021912Z # skipped 0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2022732Z # todo 0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2028813Z # duration_ms 67.993926
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2151913Z ##[group]Run npm run validate:forecast-registry
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2152275Z [36;1mnpm run validate:forecast-registry[0m
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2185566Z shell: /usr/bin/bash -e {0}
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2185799Z env:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2185973Z   OMP_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2186171Z   MKL_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2186362Z   OPENBLAS_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.2186580Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3245716Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3246181Z > validate:forecast-registry
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3246885Z > node scripts/forecast/validate-registry.mjs
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3247478Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3582249Z ✅ Schema version is registry_v1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3588486Z ✅ Champion pointer: forecast_mem_v3.0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3589331Z ✅ Registry has 1 model(s)
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3589961Z ✅ Champion model: forecast_mem_v3.0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3590540Z ✅ Champion model is ACTIVE
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3591121Z ✅ All models have required fields
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3591517Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3591889Z ✅ FORECAST REGISTRY VALIDATION PASSED
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3592243Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3715004Z ##[group]Run npm run validate:forecast-schemas
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3715358Z [36;1mnpm run validate:forecast-schemas[0m
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3748438Z shell: /usr/bin/bash -e {0}
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3748666Z env:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3748848Z   OMP_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3749052Z   MKL_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3749246Z   OPENBLAS_NUM_THREADS: 1
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.3749456Z ##[endgroup]
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.4806939Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.4807667Z > validate:forecast-schemas
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.4808874Z > npx ajv validate -s schemas/registry.v1.json -d public/data/forecast/models/registry.json --strict=false
determinism-check	UNKNOWN STEP	2026-02-09T14:47:14.4810019Z 
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.0160757Z public/data/forecast/models/registry.json valid
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.0426725Z Post job cleanup.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.1946686Z Cache hit occurred on the primary key node-cache-Linux-x64-npm-65145cf0819b06341bbca8110c0afd5d51d730cbe14e762f1aa8d31a2b0ea16b, not saving cache.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.2075158Z Post job cleanup.
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.2993027Z [command]/usr/bin/git version
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3028171Z git version 2.52.0
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3080626Z Temporarily overriding HOME='/home/runner/work/_temp/3b2dab07-09c7-4146-98c9-58d9fadc294b' before making global git config changes
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3081487Z Adding repository directory to the temporary git global config as a safe directory
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3093107Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3129088Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3167846Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3410857Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3433526Z http.https://github.com/.extraheader
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3447032Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3480082Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3722054Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.3757868Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
determinism-check	UNKNOWN STEP	2026-02-09T14:47:15.4098948Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: CI Policy Check
```
latest_run_id=21883064544
validate-policy	UNKNOWN STEP	﻿2026-02-10T21:28:17.0913070Z Current runner version: '2.331.0'
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0936918Z ##[group]Runner Image Provisioner
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0937900Z Hosted Compute Agent
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0938451Z Version: 20260123.484
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0939133Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0939797Z Build Date: 2026-01-23T19:41:17Z
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0940444Z Worker ID: {21732d95-18aa-4feb-b4cd-cbb467dbf46e}
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0941164Z Azure Region: westus
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0941722Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0943114Z ##[group]Operating System
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0943752Z Ubuntu
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0944251Z 24.04.3
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0944685Z LTS
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0945216Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0945710Z ##[group]Runner Image
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0946258Z Image: ubuntu-24.04
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0946708Z Version: 20260201.15.1
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0948109Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0949626Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0950586Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0953208Z ##[group]GITHUB_TOKEN Permissions
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0955412Z Actions: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0955951Z ArtifactMetadata: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0956493Z Attestations: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0957076Z Checks: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0957858Z Contents: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0958460Z Deployments: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0959093Z Discussions: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0959605Z Issues: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0960058Z Metadata: read
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0960597Z Models: read
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0961066Z Packages: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0961578Z Pages: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0962258Z PullRequests: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0962793Z RepositoryProjects: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0963361Z SecurityEvents: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0963886Z Statuses: write
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0964424Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0966342Z Secret source: Actions
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.0967153Z Prepare workflow directory
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.1282040Z Prepare all required actions
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.1318867Z Getting action download info
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.5999818Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.7094405Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
validate-policy	UNKNOWN STEP	2026-02-10T21:28:17.9387822Z Complete job name: validate-policy
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0046653Z ##[group]Run actions/checkout@v4
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0047489Z with:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0048120Z   repository: RubikVault/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0048799Z   token: ***
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0049178Z   ssh-strict: true
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0049569Z   ssh-user: git
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0049961Z   persist-credentials: true
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0050399Z   clean: true
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0050799Z   sparse-checkout-cone-mode: true
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0051280Z   fetch-depth: 1
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0051671Z   fetch-tags: false
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0052072Z   show-progress: true
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0052476Z   lfs: false
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0052840Z   submodules: false
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0053239Z   set-safe-directory: true
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.0053913Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1137322Z Syncing repository: RubikVault/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1139323Z ##[group]Getting Git version info
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1140132Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1141147Z [command]/usr/bin/git version
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1220213Z git version 2.52.0
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1246608Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1268310Z Temporarily overriding HOME='/home/runner/work/_temp/84d59d3d-5513-442b-ac2a-c9b29ce2da00' before making global git config changes
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1270680Z Adding repository directory to the temporary git global config as a safe directory
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1274770Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1313049Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1316806Z ##[group]Initializing the repository
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1321811Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1432430Z hint: Using 'master' as the name for the initial branch. This default branch name
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1433785Z hint: will change to "main" in Git 3.0. To configure the initial branch name
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1434692Z hint: to use in all of your new repositories, which will suppress this warning,
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1435806Z hint: call:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1436376Z hint:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1436856Z hint: 	git config --global init.defaultBranch <name>
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1437900Z hint:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1438886Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1440573Z hint: 'development'. The just-created branch can be renamed via this command:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1441879Z hint:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1442577Z hint: 	git branch -m <name>
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1443388Z hint:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1444372Z hint: Disable this message with "git config set advice.defaultBranchName false"
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1446172Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1449929Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1484661Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1485842Z ##[group]Disabling automatic garbage collection
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1489651Z [command]/usr/bin/git config --local gc.auto 0
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1517858Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1519089Z ##[group]Setting up auth
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1525260Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1554046Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1943997Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.1977342Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.2222285Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.2252689Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.2471808Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.2505585Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.2506389Z ##[group]Fetching the repository
validate-policy	UNKNOWN STEP	2026-02-10T21:28:18.2514574Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +aeee8a4e15bdb26fb2954c3a0cd3870782c579b9:refs/remotes/origin/codex/p0p1-hardening
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5244592Z From https://github.com/RubikVault/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5249665Z  * [new ref]         aeee8a4e15bdb26fb2954c3a0cd3870782c579b9 -> origin/codex/p0p1-hardening
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5280917Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5282157Z ##[group]Determining the checkout info
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5283757Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5289658Z [command]/usr/bin/git sparse-checkout disable
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5332967Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5360145Z ##[group]Checking out the ref
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.5364578Z [command]/usr/bin/git checkout --progress --force -B codex/p0p1-hardening refs/remotes/origin/codex/p0p1-hardening
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6542372Z Switched to a new branch 'codex/p0p1-hardening'
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6544822Z branch 'codex/p0p1-hardening' set up to track 'origin/codex/p0p1-hardening'.
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6560491Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6595738Z [command]/usr/bin/git log -1 --format=%H
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6617032Z aeee8a4e15bdb26fb2954c3a0cd3870782c579b9
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6928876Z ##[group]Run actions/setup-node@v4
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6930014Z with:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6930806Z   node-version: 18
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6931687Z   always-auth: false
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6932600Z   check-latest: false
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6933753Z   token: ***
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.6934558Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:19.8688460Z Attempting to download 18...
validate-policy	UNKNOWN STEP	2026-02-10T21:28:20.9196798Z Acquiring 18.20.8 - x64 from https://github.com/actions/node-versions/releases/download/18.20.8-14110393767/node-18.20.8-linux-x64.tar.gz
validate-policy	UNKNOWN STEP	2026-02-10T21:28:21.5106216Z Extracting ...
validate-policy	UNKNOWN STEP	2026-02-10T21:28:21.5206282Z [command]/usr/bin/tar xz --strip 1 --warning=no-unknown-keyword --overwrite -C /home/runner/work/_temp/7f7ea044-446b-44c8-92ab-9c9a00a84b89 -f /home/runner/work/_temp/4db90f89-80e5-415c-b44a-47bfe8c76712
validate-policy	UNKNOWN STEP	2026-02-10T21:28:22.4578082Z Adding to the cache ...
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.0788118Z ##[group]Environment details
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3229502Z node: v18.20.8
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3230185Z npm: 10.8.2
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3230556Z yarn: 1.22.22
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3231230Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3388370Z ##[group]Run node scripts/forecast/validate_policy.mjs
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3388835Z [36;1mnode scripts/forecast/validate_policy.mjs[0m
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3389155Z [36;1mecho "Policy validation passed"[0m
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3425771Z shell: /usr/bin/bash -e {0}
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3426041Z ##[endgroup]
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3820913Z Validating /home/runner/work/rubikvault-site/rubikvault-site/policies/forecast.v3.json against /home/runner/work/rubikvault-site/rubikvault-site/policies/forecast.schema.json...
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3825336Z ✅ Policy Validated (Basic Schema Check)
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3859969Z Policy validation passed
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.3936463Z Post job cleanup.
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.5654847Z Post job cleanup.
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6583366Z [command]/usr/bin/git version
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6618813Z git version 2.52.0
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6663415Z Temporarily overriding HOME='/home/runner/work/_temp/23080fa4-ac28-45dc-8456-fc43540e97a8' before making global git config changes
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6665135Z Adding repository directory to the temporary git global config as a safe directory
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6677808Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6711346Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6743783Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6970953Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.6990787Z http.https://github.com/.extraheader
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.7003074Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.7032593Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.7248709Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.7277878Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
validate-policy	UNKNOWN STEP	2026-02-10T21:28:24.7600514Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: EOD History Refresh
```
latest_run_id=21884087257
refresh-history	UNKNOWN STEP	﻿2026-02-10T22:02:30.1168191Z Current runner version: '2.331.0'
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1202809Z ##[group]Runner Image Provisioner
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1204050Z Hosted Compute Agent
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1204948Z Version: 20260123.484
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1206202Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1207533Z Build Date: 2026-01-23T19:41:17Z
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1208652Z Worker ID: {4cc80b64-d723-4e8f-a6b9-2d66567c5d1f}
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1210046Z Azure Region: centralus
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1211030Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1213066Z ##[group]Operating System
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1214183Z Ubuntu
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1215014Z 24.04.3
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1215956Z LTS
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1216859Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1217667Z ##[group]Runner Image
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1218627Z Image: ubuntu-24.04
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1219643Z Version: 20260201.15.1
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1221681Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1224481Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1226375Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1228052Z ##[group]GITHUB_TOKEN Permissions
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1230927Z Contents: write
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1231878Z Metadata: read
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1232703Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1235652Z Secret source: Actions
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1236624Z Prepare workflow directory
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1591043Z Prepare all required actions
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.1646905Z Getting action download info
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.5011383Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.5925094Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.7805853Z Complete job name: refresh-history
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8476654Z ##[group]Run actions/checkout@v4
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8477468Z with:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8477878Z   repository: RubikVault/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8478558Z   token: ***
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8478929Z   ssh-strict: true
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8479318Z   ssh-user: git
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8479720Z   persist-credentials: true
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8480156Z   clean: true
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8480548Z   sparse-checkout-cone-mode: true
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8481009Z   fetch-depth: 1
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8481384Z   fetch-tags: false
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8481766Z   show-progress: true
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8482212Z   lfs: false
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8482634Z   submodules: false
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8483078Z   set-safe-directory: true
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.8483763Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9551451Z Syncing repository: RubikVault/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9553144Z ##[group]Getting Git version info
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9553962Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9554967Z [command]/usr/bin/git version
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9625527Z git version 2.52.0
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9651696Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9667662Z Temporarily overriding HOME='/home/runner/work/_temp/4608b8ce-d7e6-4a08-a7ed-8f1777a3ca9b' before making global git config changes
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9670052Z Adding repository directory to the temporary git global config as a safe directory
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9680457Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9716760Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9720247Z ##[group]Initializing the repository
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9724022Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9817925Z hint: Using 'master' as the name for the initial branch. This default branch name
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9819299Z hint: will change to "main" in Git 3.0. To configure the initial branch name
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9820866Z hint: to use in all of your new repositories, which will suppress this warning,
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9822339Z hint: call:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9822962Z hint:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9823709Z hint: 	git config --global init.defaultBranch <name>
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9824653Z hint:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9825646Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9826535Z hint: 'development'. The just-created branch can be renamed via this command:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9827270Z hint:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9827704Z hint: 	git branch -m <name>
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9828185Z hint:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9829068Z hint: Disable this message with "git config set advice.defaultBranchName false"
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9830239Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9834301Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9867096Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9867803Z ##[group]Disabling automatic garbage collection
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9870496Z [command]/usr/bin/git config --local gc.auto 0
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9897432Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9898086Z ##[group]Setting up auth
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9903885Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
refresh-history	UNKNOWN STEP	2026-02-10T22:02:30.9932769Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0255001Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0282521Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0498471Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0526861Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0755752Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0789169Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0790410Z ##[group]Fetching the repository
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.0798931Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2:refs/remotes/origin/main
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8341114Z From https://github.com/RubikVault/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8342792Z  * [new ref]         2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2 -> origin/main
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8374882Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8376469Z ##[group]Determining the checkout info
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8377995Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8383654Z [command]/usr/bin/git sparse-checkout disable
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8424885Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8451801Z ##[group]Checking out the ref
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.8456342Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9580554Z Switched to a new branch 'main'
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9581776Z branch 'main' set up to track 'origin/main'.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9599770Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9637084Z [command]/usr/bin/git log -1 --format=%H
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9659412Z 2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9969926Z ##[group]Run actions/setup-node@v4
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9970949Z with:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9971630Z   node-version: 20
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9972416Z   always-auth: false
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9973224Z   check-latest: false
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9974314Z   token: ***
refresh-history	UNKNOWN STEP	2026-02-10T22:02:31.9975024Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.1743090Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.1747327Z ##[group]Environment details
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4809371Z node: v20.20.0
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4809952Z npm: 10.8.2
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4810417Z yarn: 1.22.22
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4811581Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4918152Z ##[group]Run npm ci || npm install node-fetch
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4918815Z [36;1mnpm ci || npm install node-fetch[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4962090Z shell: /usr/bin/bash -e {0}
refresh-history	UNKNOWN STEP	2026-02-10T22:02:32.4962614Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:33.8745452Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:34.2093728Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
refresh-history	UNKNOWN STEP	2026-02-10T22:02:35.2409866Z npm warn deprecated wrangler@4.56.0: Version 4.55.0 and 4.56.0 can incorrectly automatically delegate 'wrangler deploy' to 'opennextjs-cloudflare'. Use an older or newer version.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.4534466Z 
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.4535447Z added 106 packages, and audited 107 packages in 6s
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.4536094Z 
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.4536469Z 18 packages are looking for funding
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.4537002Z   run `npm fund` for details
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5189771Z 
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5190840Z 6 vulnerabilities (2 moderate, 4 high)
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5191328Z 
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5191839Z To address all issues (including breaking changes), run:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5192403Z   npm audit fix --force
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5192593Z 
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5192788Z Run `npm audit` for details.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5443605Z ##[group]Run # Use combined universe file (S&P 500 + NASDAQ-100 + Dow 30)
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5444148Z [36;1m# Use combined universe file (S&P 500 + NASDAQ-100 + Dow 30)[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5444547Z [36;1mUNIVERSE_FILE="./public/data/universe/all.json"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5444867Z [36;1mif [ ! -f "$UNIVERSE_FILE" ]; then[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5445198Z [36;1m   echo "Universe file not found, falling back to nasdaq100."[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5445848Z [36;1m   UNIVERSE_FILE="./public/data/universe/nasdaq100.json"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5446188Z [36;1mfi[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5446393Z [36;1mecho "Using universe: $UNIVERSE_FILE"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5446726Z [36;1mecho "Symbol count: $(jq 'length' $UNIVERSE_FILE)"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5447174Z [36;1mnode scripts/providers/eodhd-backfill-bars.mjs --universe "$UNIVERSE_FILE"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5483147Z shell: /usr/bin/bash -e {0}
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5483383Z env:
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5483728Z   EODHD_API_KEY: ***
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5483932Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5540306Z Using universe: ./public/data/universe/all.json
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5575131Z Symbol count: 517
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5842776Z Loaded 517 symbols from ./public/data/universe/all.json
refresh-history	UNKNOWN STEP	2026-02-10T22:02:38.5848636Z Processing A...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:39.7663799Z   Saved 6596 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:40.7662804Z Processing AAPL...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:41.6432316Z   Saved 11382 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:42.6437514Z Processing ABBV...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:43.3009107Z   Saved 3312 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:44.3014584Z Processing ABNB...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:44.9933990Z   Saved 1297 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:45.9931652Z Processing ABT...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:46.8684369Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:47.8682084Z Processing ACGL...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:48.9128625Z   Saved 7652 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:49.9129435Z Processing ACN...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:50.6891936Z   Saved 6177 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:51.6898952Z Processing ADBE...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:52.7126302Z   Saved 9949 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:53.7122182Z Processing ADI...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:54.2547162Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:55.2553277Z Processing ADM...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:55.9016458Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:56.9009357Z Processing ADP...
refresh-history	UNKNOWN STEP	2026-02-10T22:02:58.0270314Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:02:59.0273635Z Processing ADSK...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:00.0700677Z   Saved 10233 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:01.0705882Z Processing AEE...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:01.9513496Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:02.9511067Z Processing AEP...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:04.6573203Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:05.6571843Z Processing AES...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:07.3452515Z   Saved 8719 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:08.3447191Z Processing AFL...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:09.7079013Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:10.7086486Z Processing AIG...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:11.2456128Z   Saved 13390 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:12.2449370Z Processing AIZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:13.2650419Z   Saved 5539 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:14.2655255Z Processing AJG...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:14.7282497Z   Saved 10492 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:15.7274613Z Processing AKAM...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:16.6504428Z   Saved 6610 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:17.6502886Z Processing ALB...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:18.3120220Z   Saved 8046 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:19.3124875Z Processing ALGN...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:20.1200600Z   Saved 6297 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:21.1204465Z Processing ALL...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:21.7094632Z   Saved 8229 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:22.7090372Z Processing ALLE...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:23.3083190Z   Saved 3075 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:24.3077449Z Processing AMAT...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:25.5933358Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:26.5928522Z Processing AMCR...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:27.2746594Z   Saved 3455 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:28.2750870Z Processing AMD...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:29.1818422Z   Saved 10395 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:30.1822841Z Processing AME...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:31.5421584Z   Saved 10472 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:32.5436076Z Processing AMGN...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:33.0034141Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:34.0038356Z Processing AMP...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:34.6108019Z   Saved 5133 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:35.6122379Z Processing AMT...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:36.3584335Z   Saved 7032 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:37.3589044Z Processing AMZN...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:38.0635998Z   Saved 7230 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:39.0639735Z Processing ANET...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:39.4640844Z   Saved 2938 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:40.4645568Z Processing AON...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:41.0318334Z   Saved 11517 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:42.0332974Z Processing AOS...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:42.6977108Z   Saved 10674 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:43.6980964Z Processing APA...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:44.3199670Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:45.3203458Z Processing APD...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:46.4874866Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:47.4876979Z Processing APH...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:48.0049555Z   Saved 8622 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:49.0053485Z Processing APO...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:49.5768143Z   Saved 3739 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:50.5773362Z Processing APP...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:50.7817432Z   Saved 1212 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:51.7832892Z Processing APTV...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:52.2830347Z   Saved 3577 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:53.2833785Z Processing ARE...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:54.0451749Z   Saved 7222 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:55.0456356Z Processing ARM...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:55.2958226Z   Saved 604 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:56.2972928Z Processing ASML...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:56.9042071Z   Saved 7779 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:57.9046826Z Processing ATO...
refresh-history	UNKNOWN STEP	2026-02-10T22:03:58.6466490Z   Saved 10613 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:03:59.6469100Z Processing AVB...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:00.1229881Z   Saved 8033 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:01.1234081Z Processing AVGO...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:01.5138667Z   Saved 4154 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:02.5143284Z Processing AVY...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:03.9753246Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:04.9758758Z Processing AWK...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:05.3542415Z   Saved 4479 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:06.3546526Z Processing AXON...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:06.7582854Z   Saved 6206 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:07.7587197Z Processing AXP...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:08.2716314Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:09.2718363Z Processing AZN...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:09.5744184Z   Saved 4822 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:10.5748173Z Processing AZO...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:11.6680875Z   Saved 8779 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:12.6681895Z Processing BA...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:13.4712208Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:14.4711251Z Processing BAC...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:15.0278197Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:16.0286708Z Processing BALL...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:16.9524974Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:17.9529027Z Processing BAX...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:18.6477270Z   Saved 11162 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:19.6482059Z Processing BBY...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:20.2874434Z   Saved 10282 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:21.2878673Z Processing BDX...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:21.8807304Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:22.8814893Z Processing BEN...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:23.3427761Z   Saved 10679 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:24.3431970Z Processing BF.B...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:24.6967199Z   Failed: 404
refresh-history	UNKNOWN STEP	2026-02-10T22:04:25.6974404Z Processing BG...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:26.6397177Z   Saved 6167 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:27.6401180Z Processing BIIB...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:28.2720553Z   Saved 8662 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:29.2720492Z Processing BK...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:29.6983001Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:30.6977852Z Processing BKNG...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:31.0580015Z   Saved 6759 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:32.0584372Z Processing BKR...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:32.6300490Z   Saved 9788 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:33.6307055Z Processing BLDR...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:34.0185919Z   Saved 5192 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:35.0180445Z Processing BLK...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:35.5727858Z   Saved 6630 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:36.5732048Z Processing BMY...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:37.1072764Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:38.1071905Z Processing BR...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:38.4745102Z   Saved 4753 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:39.4739264Z Processing BRK.B...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:39.7149890Z   Saved 0 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:40.7154109Z Processing BRO...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:41.1721646Z   Saved 11341 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:42.1725764Z Processing BSX...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:42.6610235Z   Saved 8492 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:43.6609062Z Processing BX...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:44.2208533Z   Saved 4689 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:45.2213524Z Processing BXP...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:45.7016655Z   Saved 7207 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:46.7021123Z Processing C...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:47.2709047Z   Saved 9895 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:48.2711474Z Processing CAG...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:48.8834835Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:49.8829337Z Processing CAH...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:50.3815754Z   Saved 10714 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:51.3811679Z Processing CARR...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:51.7886089Z   Saved 1482 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:52.7890286Z Processing CAT...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:53.2736986Z   Saved 11569 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:54.2741691Z Processing CB...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:54.6069577Z   Saved 8277 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:55.6067557Z Processing CBOE...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:56.0855572Z   Saved 3939 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:57.0850149Z Processing CBRE...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:57.3592769Z   Saved 5452 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:58.3586629Z Processing CCEP...
refresh-history	UNKNOWN STEP	2026-02-10T22:04:58.8173538Z   Saved 9879 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:04:59.8174847Z Processing CCI...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:00.1363683Z   Saved 6913 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:01.1367959Z Processing CCL...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:01.6748371Z   Saved 9711 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:02.6750412Z Processing CDNS...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:03.3879547Z   Saved 9735 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:04.3883753Z Processing CDW...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:05.2032591Z   Saved 3175 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:06.2026260Z Processing CEG...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:06.6644154Z   Saved 1019 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:07.6639168Z Processing CF...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:08.3882025Z   Saved 5157 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:09.3876166Z Processing CFG...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:09.9249108Z   Saved 2862 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:10.9244962Z Processing CHD...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:11.4433674Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:12.4432242Z Processing CHRW...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:12.8763033Z   Saved 7124 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:13.8767029Z Processing CHTR...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:14.2947075Z   Saved 4050 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:15.2950784Z Processing CI...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:16.0940348Z   Saved 11055 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:17.0948949Z Processing CINF...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:17.9038825Z   Saved 11571 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:18.9043779Z Processing CL...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:19.4920603Z   Saved 13307 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:20.4920218Z Processing CLX...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:21.1564130Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:22.1568903Z Processing CMCSA...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:22.8126984Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:23.8135183Z Processing CME...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:24.2078546Z   Saved 5831 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:25.2081150Z Processing CMG...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:25.5361524Z   Saved 5042 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:26.5366465Z Processing CMI...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:27.0635142Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:28.0642151Z Processing CMS...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:28.6165493Z   Saved 9752 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:29.6170560Z Processing CNC...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:29.9291168Z   Saved 6078 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:30.9295528Z Processing CNP...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:31.4974082Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:32.4978953Z Processing COF...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:32.9386749Z   Saved 7860 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:33.9400681Z Processing COIN...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:34.1654656Z   Saved 1213 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:35.1658587Z Processing COO...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:35.6974159Z   Saved 9953 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:36.6978720Z Processing COP...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:37.1046723Z   Saved 11117 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:38.1060696Z Processing COR...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:38.5626261Z   Saved 7765 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:39.5639653Z Processing COST...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:40.0641557Z   Saved 10128 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:41.0645038Z Processing CPAY...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:41.3264140Z   Saved 3811 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:42.3266952Z Processing CPB...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:42.7916812Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:43.7930626Z Processing CPRT...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:44.2862502Z   Saved 8019 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:45.2867937Z Processing CPT...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:45.7106559Z   Saved 8195 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:46.7121363Z Processing CRL...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:47.1006790Z   Saved 6446 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:48.1020803Z Processing CRM...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:48.3714663Z   Saved 5444 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:49.3721528Z Processing CRWD...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:49.8489110Z   Saved 1676 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:50.8493407Z Processing CSCO...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:51.2980196Z   Saved 9061 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:52.2983698Z Processing CSGP...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:52.6775020Z   Saved 6938 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:53.6773248Z Processing CSX...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:54.0784891Z   Saved 11409 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:55.0788290Z Processing CTAS...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:55.5058714Z   Saved 10703 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:56.5064728Z Processing CTRA...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:56.8551919Z   Saved 9067 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:57.8556255Z Processing CTSH...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:58.3043141Z   Saved 6954 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:05:59.3047288Z Processing CTVA...
refresh-history	UNKNOWN STEP	2026-02-10T22:05:59.6025913Z   Saved 1688 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:00.6030195Z Processing CVS...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:01.1314640Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:02.1319140Z Processing CVX...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:03.1646643Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:04.1657108Z Processing CZR...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:04.5292910Z   Saved 8349 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:05.5297236Z Processing D...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:05.9518948Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:06.9532818Z Processing DAL...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:07.3348253Z   Saved 4729 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:08.3351539Z Processing DASH...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:08.4899237Z   Saved 1302 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:09.4902486Z Processing DAY...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:09.7093186Z   Saved 1955 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:10.7097169Z Processing DD...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:11.1770928Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:12.1778787Z Processing DDOG...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:12.5724212Z   Saved 1607 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:13.5728193Z Processing DE...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:14.1557474Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:15.1562311Z Processing DECK...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:15.5025983Z   Saved 8135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:16.5024612Z Processing DELL...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:16.7912618Z   Saved 2384 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:17.7916939Z Processing DG...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:18.1231999Z   Saved 4084 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:19.1236113Z Processing DGX...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:19.4793094Z   Saved 7333 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:20.4797632Z Processing DHI...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:20.8350091Z   Saved 8480 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:21.8357975Z Processing DHR...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:22.2954207Z   Saved 11876 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:23.2949137Z Processing DIS...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:23.8081018Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:24.8082269Z Processing DLR...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:25.5224364Z   Saved 5354 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:26.5219448Z Processing DLTR...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:26.9024949Z   Saved 7785 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:27.9019376Z Processing DOC...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:28.2565617Z   Saved 10258 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:29.2561267Z Processing DOV...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:29.6323234Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:30.6328463Z Processing DOW...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:30.9008150Z   Saved 1734 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:31.9012844Z Processing DPZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:32.2263629Z   Saved 5431 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:33.2267378Z Processing DRI...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:33.5262477Z   Saved 7741 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:34.5259171Z Processing DTE...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:35.0880346Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:36.0884735Z Processing DUK...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:36.4737864Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:37.4739846Z Processing DVA...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:37.8531253Z   Saved 7619 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:38.8535140Z Processing DVN...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:39.2202437Z   Saved 10174 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:40.2206575Z Processing DXCM...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:40.4897242Z   Saved 5240 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:41.4905674Z Processing EA...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:41.8863338Z   Saved 9164 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:42.8868106Z Processing EBAY...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:43.2083040Z   Saved 6887 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:44.2076501Z Processing ECL...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:44.5882664Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:45.5889184Z Processing ED...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:46.0923139Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:47.0928126Z Processing EFX...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:47.4893313Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:48.4896704Z Processing EG...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:48.8238424Z   Saved 7639 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:49.8243565Z Processing EIX...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:50.1440826Z   Saved 9588 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:51.1445114Z Processing EL...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:51.4497504Z   Saved 7606 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:52.4503672Z Processing ELV...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:52.7698783Z   Saved 6109 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:53.7703413Z Processing EMN...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:54.1452442Z   Saved 8094 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:55.1446876Z Processing EMR...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:55.6066617Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:56.6076359Z Processing ENPH...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:56.8151302Z   Saved 3486 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:57.8155962Z Processing EOG...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:58.1715016Z   Saved 9155 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:06:59.1708800Z Processing EPAM...
refresh-history	UNKNOWN STEP	2026-02-10T22:06:59.4492059Z   Saved 3522 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:00.4486699Z Processing EQIX...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:00.7528601Z   Saved 6412 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:01.7530649Z Processing EQR...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:02.1003696Z   Saved 8180 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:03.0997841Z Processing EQT...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:03.5722124Z   Saved 10393 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:04.5724250Z Processing ERIE...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:04.9055858Z   Saved 7621 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:05.9049312Z Processing ES...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:06.3009308Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:07.3014209Z Processing ESS...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:07.5971063Z   Saved 7974 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:08.5969744Z Processing ETN...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:09.0076093Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:10.0070165Z Processing ETR...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:10.3830726Z   Saved 11571 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:11.3834049Z Processing EVRG...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:11.8163244Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:12.8158149Z Processing EW...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:13.1318573Z   Saved 6508 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:14.1326525Z Processing EXC...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:14.5318472Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:15.5322239Z Processing EXE...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:15.6980685Z   Saved 1256 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:16.6975119Z Processing EXPD...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:17.2256554Z   Saved 10424 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:18.2264858Z Processing EXPE...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:18.6768339Z   Saved 5173 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:19.6772381Z Processing EXR...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:19.9618451Z   Saved 5409 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:20.9622498Z Processing F...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:21.4250263Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:22.4248212Z Processing FANG...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:22.7158410Z   Saved 3350 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:23.7172961Z Processing FAST...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:24.4851846Z   Saved 9692 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:25.4856461Z Processing FCX...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:25.8017665Z   Saved 7699 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:26.8027056Z Processing FDS...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:27.1579120Z   Saved 7442 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:28.1592884Z Processing FDX...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:28.6422022Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:29.6426642Z Processing FE...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:30.0397713Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:31.0411933Z Processing FFIV...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:31.3674989Z   Saved 6713 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:32.3675886Z Processing FI...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:32.8135510Z   Saved 9858 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:33.8138887Z Processing FICO...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:34.2214158Z   Saved 9164 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:35.2214720Z Processing FIS...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:35.6045251Z   Saved 6197 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:36.6049248Z Processing FITB...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:37.0460621Z   Saved 10384 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:38.0472439Z Processing FOX...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:38.3385841Z   Saved 1739 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:39.3389338Z Processing FOXA...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:39.5354631Z   Saved 1740 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:40.5357886Z Processing FRT...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:41.1286653Z   Saved 13306 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:42.1300871Z Processing FSLR...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:42.4274393Z   Saved 4836 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:43.4277521Z Processing FTNT...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:43.7406531Z   Saved 4081 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:44.7419761Z Processing FTV...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:44.9838654Z   Saved 2427 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:45.9842210Z Processing GD...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:46.4862383Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:47.4871030Z Processing GDDY...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:47.6977214Z   Saved 2733 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:48.6990988Z Processing GE...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:49.1928198Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:50.1937988Z Processing GEHC...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:50.3229688Z   Saved 790 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:51.3234903Z Processing GEN...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:51.7476929Z   Saved 9221 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:52.7483850Z Processing GEV...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:52.9510634Z   Saved 470 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:53.9514642Z Processing GFS...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:54.1100700Z   Saved 1075 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:55.1104843Z Processing GILD...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:55.6636842Z   Saved 8570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:56.6651172Z Processing GIS...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:57.0715164Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:58.0720179Z Processing GL...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:58.5532438Z   Saved 11432 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:07:59.5536731Z Processing GLW...
refresh-history	UNKNOWN STEP	2026-02-10T22:07:59.9666058Z   Saved 11117 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:00.9665094Z Processing GM...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:01.2390458Z   Saved 3829 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:02.2394494Z Processing GNRC...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:03.0070038Z   Saved 4024 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:04.0073256Z Processing GOOG...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:04.3326579Z   Saved 5404 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:05.3340225Z Processing GOOGL...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:05.6439631Z   Saved 5404 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:06.6446618Z Processing GPC...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:07.0917762Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:08.0920654Z Processing GPN...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:08.5101390Z   Saved 6305 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:09.5108795Z Processing GRMN...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:10.0956453Z   Saved 6329 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:11.0961317Z Processing GS...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:11.6188229Z   Saved 6735 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:12.6192077Z Processing GWW...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:13.0618746Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:14.0627065Z Processing HAL...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:14.5016545Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:15.5020154Z Processing HAS...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:15.8968542Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:16.8970684Z Processing HBAN...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:17.3757192Z   Saved 10395 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:18.3760634Z Processing HCA...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:18.6110523Z   Saved 3753 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:19.6114390Z Processing HD...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:19.9994824Z   Saved 11187 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:20.9998564Z Processing HIG...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:21.2898560Z   Saved 7587 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:22.2907749Z Processing HII...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:22.5454519Z   Saved 3745 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:23.5458921Z Processing HLT...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:23.8349381Z   Saved 3058 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:24.8353677Z Processing HOLX...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:25.1820577Z   Saved 9049 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:26.1821078Z Processing HON...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:26.5642971Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:27.5647606Z Processing HPE...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:27.7852087Z   Saved 2593 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:28.7854518Z Processing HPQ...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:29.2370758Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:30.2373967Z Processing HRL...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:30.6030939Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:31.6036066Z Processing HSIC...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:31.9320315Z   Saved 7616 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:32.9324083Z Processing HST...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:33.3102408Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:34.3104898Z Processing HSY...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:34.7743379Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:35.7746004Z Processing HUBB...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:36.1844286Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:37.1838463Z Processing HUM...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:37.5658071Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:38.5662144Z Processing HWM...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:38.7613258Z   Saved 2331 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:39.7616594Z Processing IBM...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:40.1892489Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:41.1895988Z Processing ICE...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:41.4912052Z   Saved 5089 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:42.4917577Z Processing IDXX...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:42.7885024Z   Saved 8721 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:43.7878330Z Processing IEX...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:44.1088876Z   Saved 9224 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:45.1088212Z Processing IFF...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:45.5927944Z   Saved 12895 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:46.5932118Z Processing INCY...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:46.8855663Z   Saved 8119 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:47.8854527Z Processing INTC...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:48.2331353Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:49.2336308Z Processing INTU...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:49.5792597Z   Saved 8286 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:50.5793269Z Processing INVH...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:50.8129464Z   Saved 2269 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:51.8134914Z Processing IP...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:52.2080582Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:53.2084461Z Processing IPG...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:53.5959420Z   Saved 13478 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:54.5962054Z Processing IQV...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:54.8020925Z   Saved 3209 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:55.8017460Z Processing IR...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:56.2421519Z   Saved 2199 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:57.2425965Z Processing IRM...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:57.5420461Z   Saved 7555 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:58.5424538Z Processing ISRG...
refresh-history	UNKNOWN STEP	2026-02-10T22:08:58.8201569Z   Saved 6454 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:08:59.8200808Z Processing IT...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:00.1064806Z   Saved 8143 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:01.1058725Z Processing ITW...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:01.5263652Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:02.5264501Z Processing IVZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:02.9187795Z   Saved 7665 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:03.9191498Z Processing J...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:04.2966118Z   Saved 11492 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:05.2963234Z Processing JBHT...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:05.7012036Z   Saved 10392 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:06.7015925Z Processing JBL...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:07.0036742Z   Saved 8251 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:08.0036494Z Processing JCI...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:08.3893086Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:09.3897772Z Processing JKHY...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:09.7569638Z   Saved 9962 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:10.7576035Z Processing JNJ...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:11.3004195Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:12.2998880Z Processing JPM...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:12.7001371Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:13.6998711Z Processing K...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:14.0870602Z   Saved 13470 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:15.0874694Z Processing KDP...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:15.3181017Z   Saved 4469 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:16.3175088Z Processing KEY...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:16.6978635Z   Saved 10394 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:17.6982695Z Processing KEYS...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:17.9863050Z   Saved 2844 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:18.9857472Z Processing KHC...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:19.2216248Z   Saved 3369 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:20.2211210Z Processing KIM...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:20.5444531Z   Saved 8614 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:21.5439068Z Processing KKR...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:21.8281327Z   Saved 4621 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:22.8274277Z Processing KLAC...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:23.2263968Z   Saved 11427 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:24.2255801Z Processing KMB...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:24.6966381Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:25.6961058Z Processing KMI...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:26.1521805Z   Saved 3771 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:27.1516077Z Processing KMX...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:27.5223245Z   Saved 7300 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:28.5238949Z Processing KO...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:28.9896621Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:29.9911733Z Processing KR...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:30.4828840Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:31.4843652Z Processing KVUE...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:31.6390349Z   Saved 695 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:32.6393674Z Processing L...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:33.0607208Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:34.0621398Z Processing LDOS...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:34.4016038Z   Saved 4861 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:35.4021228Z Processing LEN...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:36.0033067Z   Saved 10384 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:37.0036995Z Processing LH...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:37.4111036Z   Saved 9415 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:38.4114932Z Processing LHX...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:38.8004189Z   Saved 11117 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:39.8007744Z Processing LII...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:40.1495550Z   Saved 6675 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:41.1499750Z Processing LIN...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:41.4373380Z   Saved 8472 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:42.4374268Z Processing LKQ...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:42.8010240Z   Saved 5624 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:43.8014563Z Processing LLY...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:44.2443417Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:45.2447373Z Processing LMT...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:45.6982971Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:46.6988032Z Processing LNT...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:47.0045028Z   Saved 10394 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:48.0052897Z Processing LOW...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:48.3706158Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:49.3710997Z Processing LRCX...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:49.6936493Z   Saved 10524 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:50.6941243Z Processing LULU...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:50.9699418Z   Saved 4665 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:51.9704632Z Processing LUV...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:52.3775905Z   Saved 13628 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:53.3781206Z Processing LVS...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:53.6779076Z   Saved 5322 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:54.6783468Z Processing LW...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:54.8727806Z   Saved 2324 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:55.8732926Z Processing LYB...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:56.1410607Z   Saved 3972 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:57.1415700Z Processing LYV...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:57.4190709Z   Saved 5070 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:58.4193799Z Processing MA...
refresh-history	UNKNOWN STEP	2026-02-10T22:09:58.6856915Z   Saved 4959 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:09:59.6871053Z Processing MAA...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:00.0036345Z   Saved 8062 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:01.0036617Z Processing MAR...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:01.3906963Z   Saved 8145 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:02.3921039Z Processing MAS...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:02.9486092Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:03.9484432Z Processing MCD...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:04.5788712Z   Saved 15000 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:05.5793764Z Processing MCHP...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:05.9522598Z   Saved 8281 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:06.9522810Z Processing MCK...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:07.4108807Z   Saved 10395 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:08.4123046Z Processing MCO...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:08.9439455Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:09.9451425Z Processing MDLZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:10.2364253Z   Saved 6202 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:11.2368735Z Processing MDT...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:11.6787931Z   Saved 13307 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:12.6791789Z Processing MELI...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:12.9545246Z   Saved 4655 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:13.9549202Z Processing MET...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:14.2684413Z   Saved 6501 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:15.2687563Z Processing META...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:15.7299659Z   Saved 3452 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:16.7304257Z Processing MGM...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:17.0941111Z   Saved 9319 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:18.0945886Z Processing MHK...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:18.4332547Z   Saved 8521 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:19.4334459Z Processing MKC...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:19.9566215Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:20.9569665Z Processing MKTX...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:21.3140625Z   Saved 5349 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:22.3145075Z Processing MLM...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:22.7633720Z   Saved 8045 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:23.7638311Z Processing MMC...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:24.1673235Z   Saved 13337 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:25.1674210Z Processing MMM...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:25.6362218Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:26.6361804Z Processing MNST...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:26.9737355Z   Saved 9802 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:27.9741162Z Processing MO...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:28.3716350Z   Saved 11568 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:29.3718220Z Processing MOH...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:29.6807769Z   Saved 5689 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:30.6821764Z Processing MOS...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:31.0398374Z   Saved 9583 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:32.0409289Z Processing MPC...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:32.3133189Z   Saved 3680 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:33.3136772Z Processing MPWR...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:33.5962638Z   Saved 5339 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:34.5968106Z Processing MRK...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:35.0209942Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:36.0210809Z Processing MRNA...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:36.5536359Z   Saved 1803 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:37.5541046Z Processing MRVL...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:37.8563528Z   Saved 6444 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:38.8567581Z Processing MS...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:39.1933897Z   Saved 8299 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:40.1937879Z Processing MSCI...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:40.4928123Z   Saved 4587 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:41.4933157Z Processing MSFT...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:42.1917912Z   Saved 10056 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:43.1921706Z Processing MSI...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:43.6506190Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:44.6505012Z Processing MSTR...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:45.0210667Z   Saved 6960 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:46.0214557Z Processing MTB...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:46.3750868Z   Saved 10271 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:47.3754753Z Processing MTCH...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:47.7958468Z   Saved 8323 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:48.7958740Z Processing MTD...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:49.1154336Z   Saved 7102 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:50.1149216Z Processing MU...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:50.5272497Z   Saved 10505 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:51.5276776Z Processing NCLH...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:51.7766666Z   Saved 3285 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:52.7769095Z Processing NDAQ...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:53.0810125Z   Saved 5923 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:54.0814531Z Processing NDSN...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:54.5618079Z   Saved 10336 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:55.5621453Z Processing NEE...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:56.0842358Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:57.0838188Z Processing NEM...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:57.5320877Z   Saved 10395 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:58.5324116Z Processing NFLX...
refresh-history	UNKNOWN STEP	2026-02-10T22:10:58.8400206Z   Saved 5968 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:10:59.8404935Z Processing NI...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:00.2476213Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:01.2470344Z Processing NKE...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:01.7242593Z   Saved 11390 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:02.7237801Z Processing NOC...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:03.1829605Z   Saved 11117 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:04.1833321Z Processing NOW...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:04.4771155Z   Saved 3423 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:05.4775241Z Processing NRG...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:05.7687729Z   Saved 5583 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:06.7694964Z Processing NSC...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:07.1433087Z   Saved 11012 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:08.1428060Z Processing NTAP...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:08.4445837Z   Saved 7603 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:09.4444348Z Processing NTRS...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:09.8224910Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:10.8218419Z Processing NUE...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:11.3355604Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:12.3346758Z Processing NVDA...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:12.6263629Z   Saved 6805 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:13.6267993Z Processing NVR...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:14.0441913Z   Saved 9934 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:15.0444976Z Processing NWS...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:15.2902414Z   Saved 3181 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:16.2897242Z Processing NWSA...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:16.5279335Z   Saved 3181 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:17.5283950Z Processing NXPI...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:17.7791036Z   Saved 3902 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:18.7794879Z Processing O...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:19.0680954Z   Saved 7881 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:20.0676420Z Processing ODFL...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:20.3933105Z   Saved 8635 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:21.3932882Z Processing OKE...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:21.8012884Z   Saved 11432 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:22.8013333Z Processing OMC...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:23.2046610Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:24.2056042Z Processing ON...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:24.4936123Z   Saved 6485 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:25.4940819Z Processing ORCL...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:25.9603404Z   Saved 10057 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:26.9598005Z Processing ORLY...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:27.2716724Z   Saved 8255 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:28.2715091Z Processing OTIS...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:28.4223858Z   Saved 1482 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:29.4218670Z Processing OXY...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:29.7809521Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:30.7815764Z Processing PANW...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:31.0121522Z   Saved 3409 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:32.0116967Z Processing PAYC...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:32.2435160Z   Saved 2974 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:33.2428284Z Processing PAYX...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:33.6705749Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:34.6699554Z Processing PCAR...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:35.1028174Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:36.1028998Z Processing PCG...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:36.5302708Z   Saved 13537 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:37.5297395Z Processing PDD...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:37.7092445Z   Saved 1896 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:38.7086550Z Processing PEG...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:39.0706559Z   Saved 11622 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:40.0701227Z Processing PEP...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:40.4628939Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:41.4643714Z Processing PFE...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:41.8683659Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:42.8692443Z Processing PFG...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:43.1472181Z   Saved 6114 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:44.1476535Z Processing PG...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:44.5848805Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:45.5857034Z Processing PGR...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:45.9755568Z   Saved 10382 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:46.9759183Z Processing PH...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:47.3660520Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:48.3671097Z Processing PHM...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:48.9819193Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:49.9824335Z Processing PKG...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:50.2600614Z   Saved 6548 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:51.2604353Z Processing PLD...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:51.5617596Z   Saved 7097 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:52.5631855Z Processing PLTR...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:52.7342817Z   Saved 1347 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:53.7347107Z Processing PM...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:54.0026976Z   Saved 4505 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:55.0041440Z Processing PNC...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:55.3988999Z   Saved 10395 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:56.3994724Z Processing PNR...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:56.8241569Z   Saved 13306 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:57.8248482Z Processing PNW...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:58.2135544Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:11:59.2139930Z Processing PODD...
refresh-history	UNKNOWN STEP	2026-02-10T22:11:59.5083480Z   Saved 4716 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:00.5088633Z Processing POOL...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:00.8161332Z   Saved 7596 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:01.8170005Z Processing PPG...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:02.4106182Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:03.4110495Z Processing PPL...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:04.0227978Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:05.0239971Z Processing PRU...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:05.3923423Z   Saved 6078 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:06.3927755Z Processing PSA...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:06.7439049Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:07.7443990Z Processing PSKY...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:08.1613958Z   Saved 8974 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:09.1618786Z Processing PSX...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:09.4104763Z   Saved 3478 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:10.4109916Z Processing PTC...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:10.7601250Z   Saved 9109 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:11.7606101Z Processing PWR...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:12.1078775Z   Saved 7042 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:13.1088883Z Processing PYPL...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:13.3280018Z   Saved 2667 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:14.3284928Z Processing QCOM...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:15.2241151Z   Saved 8600 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:16.2245550Z Processing RCL...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:16.5818718Z   Saved 8254 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:17.5823788Z Processing REG...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:17.8955999Z   Saved 8117 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:18.8960644Z Processing REGN...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:19.2857080Z   Saved 8779 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:20.2868273Z Processing RF...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:20.7735584Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:21.7739396Z Processing RJF...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:22.1643090Z   Saved 10737 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:23.1647217Z Processing RL...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:23.5231367Z   Saved 7211 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:24.5236283Z Processing RMD...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:24.8696076Z   Saved 7724 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:25.8700347Z Processing ROK...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:26.3087423Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:27.3099284Z Processing ROL...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:27.8047622Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:28.8052037Z Processing ROP...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:29.1141400Z   Saved 8555 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:30.1149428Z Processing ROST...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:30.4875560Z   Saved 10205 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:31.4879509Z Processing RSG...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:31.8052396Z   Saved 6946 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:32.8055709Z Processing RTX...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:33.2165178Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:34.2169468Z Processing RVTY...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:34.6245711Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:35.6240164Z Processing SBAC...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:36.0445802Z   Saved 6705 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:37.0442225Z Processing SBUX...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:37.3731977Z   Saved 8465 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:38.3736304Z Processing SCHW...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:38.7379267Z   Saved 9670 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:39.7383291Z Processing SHOP...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:39.9692609Z   Saved 2698 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:40.9692722Z Processing SHW...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:41.4529294Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:42.4542935Z Processing SJM...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:42.8360475Z   Saved 10394 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:43.8362258Z Processing SLB...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:44.2611886Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:45.2616444Z Processing SMCI...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:45.6091650Z   Saved 4748 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:46.6096028Z Processing SNA...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:47.0083281Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:48.0085227Z Processing SNPS...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:48.3879915Z   Saved 8550 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:49.3884758Z Processing SO...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:49.8224268Z   Saved 11117 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:50.8222230Z Processing SOLV...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:50.9838027Z   Saved 471 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:51.9843436Z Processing SPG...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:52.3560854Z   Saved 8094 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:53.3566668Z Processing SPGI...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:53.7885145Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:54.7888920Z Processing SRE...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:55.1656608Z   Saved 6948 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:56.1661796Z Processing STE...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:56.4802896Z   Saved 8484 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:57.4808264Z Processing STLD...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:57.8174863Z   Saved 7349 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:12:58.8177855Z Processing STT...
refresh-history	UNKNOWN STEP	2026-02-10T22:12:59.1780009Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:00.1784829Z Processing STX...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:00.4964511Z   Saved 5828 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:01.4959574Z Processing STZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:01.8716040Z   Saved 9659 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:02.8709791Z Processing SW...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:03.2008863Z   Saved 4441 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:04.2014093Z Processing SWK...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:04.5959122Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:05.5962906Z Processing SWKS...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:05.9865633Z   Saved 10437 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:06.9868185Z Processing SYF...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:07.2467463Z   Saved 2900 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:08.2472249Z Processing SYK...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:08.7114683Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:09.7108530Z Processing SYY...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:10.0953454Z   Saved 13303 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:11.0955647Z Processing T...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:11.4563886Z   Saved 10638 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:12.4558918Z Processing TAP...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:12.8274236Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:13.8273785Z Processing TDG...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:14.1262464Z   Saved 5009 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:15.1267962Z Processing TDY...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:15.4044568Z   Saved 6593 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:16.4039989Z Processing TEAM...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:16.6050546Z   Saved 2556 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:17.6056982Z Processing TECH...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:17.9839392Z   Saved 9307 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:18.9843128Z Processing TEL...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:19.3970473Z   Saved 4695 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:20.3974925Z Processing TER...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:20.8234916Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:21.8230726Z Processing TFC...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:22.2026940Z   Saved 11569 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:23.2030835Z Processing TGT...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:23.6010939Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:24.6017093Z Processing TJX...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:24.9686696Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:25.9696674Z Processing TKO...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:26.2830353Z   Saved 6618 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:27.2835692Z Processing TMO...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:27.6961745Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:28.6956532Z Processing TMUS...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:29.0073876Z   Saved 4734 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:30.0068632Z Processing TPL...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:30.7835106Z   Saved 10164 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:31.7830368Z Processing TPR...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:32.0578217Z   Saved 6374 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:33.0577652Z Processing TRGP...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:33.2972615Z   Saved 3817 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:34.2967766Z Processing TRI...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:34.6450812Z   Saved 5955 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:35.6454893Z Processing TRMB...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:35.9392338Z   Saved 8955 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:36.9391561Z Processing TROW...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:37.3116850Z   Saved 10027 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:38.3110420Z Processing TRV...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:38.7421842Z   Saved 12663 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:39.7422940Z Processing TSCO...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:40.0518466Z   Saved 8048 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:41.0522119Z Processing TSLA...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:41.3513887Z   Saved 3929 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:42.3507280Z Processing TSN...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:42.7264519Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:43.7264498Z Processing TT...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:44.1032383Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:45.1036691Z Processing TTD...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:45.3123315Z   Saved 2360 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:46.3117472Z Processing TTWO...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:46.6246500Z   Saved 7230 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:47.6248421Z Processing TXN...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:48.0310033Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:49.0304706Z Processing TXT...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:49.4190004Z   Saved 13356 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:50.4192271Z Processing TYL...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:50.7913846Z   Saved 11547 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:51.7909805Z Processing UAL...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:52.0916595Z   Saved 5042 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:53.0942575Z Processing UBER...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:53.3134952Z   Saved 1698 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:54.3134511Z Processing UDR...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:54.6838877Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:55.6852853Z Processing UHS...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:56.0617871Z   Saved 11239 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:57.0631258Z Processing ULTA...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:57.3266446Z   Saved 4602 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:58.3270345Z Processing UNH...
refresh-history	UNKNOWN STEP	2026-02-10T22:13:58.6920364Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:13:59.6924634Z Processing UNP...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:00.0456843Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:01.0467750Z Processing UPS...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:01.3854208Z   Saved 6602 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:02.3858886Z Processing URI...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:03.0456674Z   Saved 7079 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:04.0451255Z Processing USB...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:04.5453244Z   Saved 13306 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:05.5456995Z Processing V...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:05.8206645Z   Saved 4503 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:06.8220416Z Processing VICI...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:07.0471793Z   Saved 2086 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:08.0472504Z Processing VLO...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:08.4734853Z   Saved 11116 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:09.4738521Z Processing VLTO...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:09.6527443Z   Saved 595 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:10.6541497Z Processing VMC...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:11.0527136Z   Saved 10393 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:12.0538170Z Processing VRSK...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:12.2972910Z   Saved 4111 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:13.2977048Z Processing VRSN...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:13.6434267Z   Saved 7051 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:14.6438526Z Processing VRTX...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:15.0168828Z   Saved 8696 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:16.0178387Z Processing VST...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:16.2292823Z   Saved 2350 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:17.2297519Z Processing VTR...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:17.6184112Z   Saved 9164 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:18.6187809Z Processing VTRS...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:19.0282988Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:20.0284519Z Processing VZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:20.4032571Z   Saved 10638 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:21.4037034Z Processing WAB...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:21.7182290Z   Saved 7714 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:22.7186324Z Processing WAT...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:23.0113538Z   Saved 7606 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:24.0115135Z Processing WBA...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:24.4030384Z   Saved 10283 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:25.4034143Z Processing WBD...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:25.7066859Z   Saved 5183 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:26.7071335Z Processing WDAY...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:26.9177412Z   Saved 3350 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:27.9188250Z Processing WDC...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:28.2987283Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:29.2991992Z Processing WEC...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:29.7058976Z   Saved 11570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:30.7071281Z Processing WELL...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:31.0223809Z   Saved 10205 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:32.0228190Z Processing WFC...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:32.4052997Z   Saved 13536 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:33.4054465Z Processing WM...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:33.7364689Z   Saved 9442 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:34.7369342Z Processing WMB...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:35.1124941Z   Saved 10395 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:36.1123131Z Processing WMT...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:36.5073722Z   Saved 13476 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:37.5077827Z Processing WRB...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:37.8987398Z   Saved 10385 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:38.8998654Z Processing WSM...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:39.2696001Z   Saved 10259 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:40.2699329Z Processing WST...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:40.6499514Z   Saved 11535 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:41.6511083Z Processing WTW...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:41.9640086Z   Saved 6203 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:42.9644535Z Processing WY...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:43.3776394Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:44.3779910Z Processing WYNN...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:44.6700889Z   Saved 5860 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:45.6701204Z Processing XEL...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:46.1768303Z   Saved 10396 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:47.1771953Z Processing XOM...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:47.6206260Z   Saved 16135 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:48.6208663Z Processing XYL...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:48.8511489Z   Saved 3602 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:49.8515995Z Processing XYZ...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:50.0572371Z   Saved 2570 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:51.0575876Z Processing YUM...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:51.5000290Z   Saved 7144 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:52.5004057Z Processing ZBH...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:52.8167506Z   Saved 6173 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:53.8176035Z Processing ZBRA...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:54.1213024Z   Saved 8684 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:55.1216514Z Processing ZS...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:55.4406609Z   Saved 1987 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:56.4421646Z Processing ZTS...
refresh-history	UNKNOWN STEP	2026-02-10T22:14:56.6753356Z   Saved 3276 bars.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6763796Z Done.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6892259Z ##[group]Run git config --global user.name "rv-bot"
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6892643Z [36;1mgit config --global user.name "rv-bot"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6892977Z [36;1mgit config --global user.email "bot@rubikvault.com"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6893294Z [36;1mgit add public/data/eod/bars[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6893702Z [36;1mgit commit -m "chore(data): refresh eod history [skip ci]" || echo "No changes to commit"[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6894122Z [36;1mgit push[0m
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6925675Z shell: /usr/bin/bash -e {0}
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.6925913Z ##[endgroup]
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.8233477Z On branch main
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.8234033Z Your branch is up to date with 'origin/main'.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.8234391Z 
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.8234645Z nothing to commit, working tree clean
refresh-history	UNKNOWN STEP	2026-02-10T22:14:57.8237185Z No changes to commit
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.0314548Z Everything up-to-date
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.0406289Z Post job cleanup.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.2054406Z Post job cleanup.
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.2992424Z [command]/usr/bin/git version
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3030858Z git version 2.52.0
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3068422Z Copying '/home/runner/.gitconfig' to '/home/runner/work/_temp/8003de2a-c618-4fc5-82df-2b62fe76ecfa/.gitconfig'
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3077859Z Temporarily overriding HOME='/home/runner/work/_temp/8003de2a-c618-4fc5-82df-2b62fe76ecfa' before making global git config changes
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3079393Z Adding repository directory to the temporary git global config as a safe directory
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3083754Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3118469Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3149700Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3374357Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3393747Z http.https://github.com/.extraheader
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3406158Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3435913Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3651899Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.3681345Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
refresh-history	UNKNOWN STEP	2026-02-10T22:14:58.4002236Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Forecast Rollback
```
latest_run_id=NONE -> auto_repro_attempt
could not create workflow dispatch event: HTTP 422: Required input 'reason' not provided (https://api.github.com/repos/RubikVault/rubikvault-site/actions/workflows/230907136/dispatches)
```

### WORKFLOW: Ops Auto-Alerts
```
latest_run_id=21885261398
check-alerts	UNKNOWN STEP	﻿2026-02-10T22:43:00.7523106Z Current runner version: '2.331.0'
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7548482Z ##[group]Runner Image Provisioner
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7549267Z Hosted Compute Agent
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7549819Z Version: 20260123.484
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7550365Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7551308Z Build Date: 2026-01-23T19:41:17Z
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7551974Z Worker ID: {157a796d-852f-4bcc-8236-b54e06bb80ea}
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7552602Z Azure Region: northcentralus
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7553381Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7554847Z ##[group]Operating System
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7555413Z Ubuntu
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7555927Z 24.04.3
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7556370Z LTS
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7556772Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7557356Z ##[group]Runner Image
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7557884Z Image: ubuntu-24.04
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7558342Z Version: 20260201.15.1
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7559518Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7560957Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7562361Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7563366Z ##[group]GITHUB_TOKEN Permissions
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7565612Z Issues: write
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7566173Z Metadata: read
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7566655Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7569015Z Secret source: Actions
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7570140Z Prepare workflow directory
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7904618Z Prepare all required actions
check-alerts	UNKNOWN STEP	2026-02-10T22:43:00.7946092Z Getting action download info
check-alerts	UNKNOWN STEP	2026-02-10T22:43:01.2022072Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
check-alerts	UNKNOWN STEP	2026-02-10T22:43:01.2987050Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
check-alerts	UNKNOWN STEP	2026-02-10T22:43:01.4337822Z Download action repository 'actions/github-script@v7' (SHA:f28e40c7f34bde8b3046d885e986cb6290c5673b)
check-alerts	UNKNOWN STEP	2026-02-10T22:43:01.9524400Z Complete job name: check-alerts
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0344651Z ##[group]Run actions/checkout@v4
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0346023Z with:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0346844Z   repository: RubikVault/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0348217Z   token: ***
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0348977Z   ssh-strict: true
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0349762Z   ssh-user: git
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0350557Z   persist-credentials: true
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0351631Z   clean: true
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0352459Z   sparse-checkout-cone-mode: true
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0353431Z   fetch-depth: 1
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0354239Z   fetch-tags: false
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0355060Z   show-progress: true
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0355872Z   lfs: false
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0356621Z   submodules: false
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0357436Z   set-safe-directory: true
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.0358588Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1460877Z Syncing repository: RubikVault/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1463839Z ##[group]Getting Git version info
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1465373Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1467604Z [command]/usr/bin/git version
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1524631Z git version 2.52.0
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1550918Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1565654Z Temporarily overriding HOME='/home/runner/work/_temp/3af5bdcc-6e26-4760-a53b-38255fcaf764' before making global git config changes
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1568397Z Adding repository directory to the temporary git global config as a safe directory
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1578829Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1616935Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1619865Z ##[group]Initializing the repository
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1624812Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1724628Z hint: Using 'master' as the name for the initial branch. This default branch name
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1728034Z hint: will change to "main" in Git 3.0. To configure the initial branch name
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1731999Z hint: to use in all of your new repositories, which will suppress this warning,
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1734702Z hint: call:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1736110Z hint:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1738009Z hint: 	git config --global init.defaultBranch <name>
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1740048Z hint:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1742129Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1745271Z hint: 'development'. The just-created branch can be renamed via this command:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1747646Z hint:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1748609Z hint: 	git branch -m <name>
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1749490Z hint:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1750667Z hint: Disable this message with "git config set advice.defaultBranchName false"
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1753337Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1758562Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1779279Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1781929Z ##[group]Disabling automatic garbage collection
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1784159Z [command]/usr/bin/git config --local gc.auto 0
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1813918Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1816183Z ##[group]Setting up auth
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1821892Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.1854465Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2182251Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2215974Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2436662Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2467425Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2701778Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2739635Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2740999Z ##[group]Fetching the repository
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.2749175Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2:refs/remotes/origin/main
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9893788Z From https://github.com/RubikVault/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9895459Z  * [new ref]         2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2 -> origin/main
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9928839Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9931051Z ##[group]Determining the checkout info
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9933711Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9936771Z [command]/usr/bin/git sparse-checkout disable
check-alerts	UNKNOWN STEP	2026-02-10T22:43:02.9978655Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.0005681Z ##[group]Checking out the ref
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.0009505Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1176717Z Switched to a new branch 'main'
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1178518Z branch 'main' set up to track 'origin/main'.
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1195991Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1234849Z [command]/usr/bin/git log -1 --format=%H
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1259195Z 2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1562865Z ##[group]Run actions/setup-node@v4
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1563799Z with:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1564462Z   node-version: 18
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1565190Z   always-auth: false
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1565950Z   check-latest: false
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1566933Z   token: ***
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.1567614Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.3480301Z Attempting to download 18...
check-alerts	UNKNOWN STEP	2026-02-10T22:43:03.9415026Z Acquiring 18.20.8 - x64 from https://github.com/actions/node-versions/releases/download/18.20.8-14110393767/node-18.20.8-linux-x64.tar.gz
check-alerts	UNKNOWN STEP	2026-02-10T22:43:04.3675169Z Extracting ...
check-alerts	UNKNOWN STEP	2026-02-10T22:43:04.3785898Z [command]/usr/bin/tar xz --strip 1 --warning=no-unknown-keyword --overwrite -C /home/runner/work/_temp/5a8b37bf-95b7-4b00-8e09-a16a749f6f53 -f /home/runner/work/_temp/1361530c-4496-44ff-a726-7fcf281a6de0
check-alerts	UNKNOWN STEP	2026-02-10T22:43:05.3463521Z Adding to the cache ...
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.0841345Z ##[group]Environment details
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3183560Z node: v18.20.8
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3184182Z npm: 10.8.2
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3184665Z yarn: 1.22.22
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3185521Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3342985Z ##[group]Run # Read latest ops report
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3343366Z [36;1m# Read latest ops report[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3343686Z [36;1mif [ -f "dev/ops/forecast/latest.json" ]; then[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3344115Z [36;1m  STATUS=$(jq -r '.status // "UNKNOWN"' dev/ops/forecast/latest.json)[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3344600Z [36;1m  RECS=$(jq -r '.recommendations | length' dev/ops/forecast/latest.json)[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3345172Z [36;1m  P1_COUNT=$(jq -r '[.recommendations[] | select(.level == "P1")] | length' dev/ops/forecast/latest.json)[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3345662Z [36;1m  [0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3345910Z [36;1m  echo "status=$STATUS" >> $GITHUB_OUTPUT[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3346245Z [36;1m  echo "recommendations=$RECS" >> $GITHUB_OUTPUT[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3346580Z [36;1m  echo "p1_count=$P1_COUNT" >> $GITHUB_OUTPUT[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3346853Z [36;1melse[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3347078Z [36;1m  echo "status=MISSING_REPORT" >> $GITHUB_OUTPUT[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3347431Z [36;1m  echo "recommendations=0" >> $GITHUB_OUTPUT[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3347725Z [36;1m  echo "p1_count=1" >> $GITHUB_OUTPUT[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3347983Z [36;1mfi[0m
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3387018Z shell: /usr/bin/bash -e {0}
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3387301Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3733265Z ##[group]Run actions/github-script@v7
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3733557Z with:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3736469Z   script: const today = new Date().toISOString().split('T')[0];
check-alerts	UNKNOWN STEP	const title = `⚠️ Forecast System Alert - ${today}`;
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	// Check if issue already exists today (rate limit)
check-alerts	UNKNOWN STEP	const issues = await github.rest.issues.listForRepo({
check-alerts	UNKNOWN STEP	  owner: context.repo.owner,
check-alerts	UNKNOWN STEP	  repo: context.repo.repo,
check-alerts	UNKNOWN STEP	  state: 'open',
check-alerts	UNKNOWN STEP	  labels: 'ops-alert',
check-alerts	UNKNOWN STEP	  per_page: 10
check-alerts	UNKNOWN STEP	});
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	const existingToday = issues.data.find(i => i.title.includes(today));
check-alerts	UNKNOWN STEP	if (existingToday) {
check-alerts	UNKNOWN STEP	  console.log('Alert already raised today, skipping');
check-alerts	UNKNOWN STEP	  return;
check-alerts	UNKNOWN STEP	}
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	const body = `## System Health Alert
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	**Status:** BOOTSTRAP
check-alerts	UNKNOWN STEP	**P1 Recommendations:** 2
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	Please review the ops dashboard and take action.
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	- Dashboard: \`dev/ops/forecast/index.html\`
check-alerts	UNKNOWN STEP	- Latest Report: \`dev/ops/forecast/latest.json\`
check-alerts	UNKNOWN STEP	`;
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	await github.rest.issues.create({
check-alerts	UNKNOWN STEP	  owner: context.repo.owner,
check-alerts	UNKNOWN STEP	  repo: context.repo.repo,
check-alerts	UNKNOWN STEP	  title,
check-alerts	UNKNOWN STEP	  body,
check-alerts	UNKNOWN STEP	  labels: ['ops-alert', 'forecast', 'auto-generated']
check-alerts	UNKNOWN STEP	});
check-alerts	UNKNOWN STEP	
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3739569Z   github-token: ***
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3739798Z   debug: false
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3740042Z   user-agent: actions/github-script
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3740304Z   result-encoding: json
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3740506Z   retries: 0
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3740731Z   retry-exempt-status-codes: 400,401,403,404,422
check-alerts	UNKNOWN STEP	2026-02-10T22:43:07.3741016Z ##[endgroup]
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.3458773Z Post job cleanup.
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.5167274Z Post job cleanup.
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6148422Z [command]/usr/bin/git version
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6180554Z git version 2.52.0
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6227610Z Temporarily overriding HOME='/home/runner/work/_temp/5bee29f1-2ec6-4b0c-a154-558f42173b63' before making global git config changes
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6229192Z Adding repository directory to the temporary git global config as a safe directory
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6234879Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6281037Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6316596Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6555409Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6579865Z http.https://github.com/.extraheader
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6593684Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6628009Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6860454Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.6893935Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
check-alerts	UNKNOWN STEP	2026-02-10T22:43:08.7228327Z Cleaning up orphan processes

### WORKFLOW: Universe Refresh
```
latest_run_id=21763443287
fetch-constituents	Set up job	﻿2026-02-06T19:38:07.8269597Z Current runner version: '2.331.0'
fetch-constituents	Set up job	2026-02-06T19:38:07.8293965Z ##[group]Runner Image Provisioner
fetch-constituents	Set up job	2026-02-06T19:38:07.8294795Z Hosted Compute Agent
fetch-constituents	Set up job	2026-02-06T19:38:07.8295423Z Version: 20260123.484
fetch-constituents	Set up job	2026-02-06T19:38:07.8296027Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
fetch-constituents	Set up job	2026-02-06T19:38:07.8296712Z Build Date: 2026-01-23T19:41:17Z
fetch-constituents	Set up job	2026-02-06T19:38:07.8297405Z Worker ID: {53dafbd5-11d6-4487-bcb2-28c057c5b2e6}
fetch-constituents	Set up job	2026-02-06T19:38:07.8298144Z Azure Region: westcentralus
fetch-constituents	Set up job	2026-02-06T19:38:07.8298688Z ##[endgroup]
fetch-constituents	Set up job	2026-02-06T19:38:07.8300085Z ##[group]Operating System
fetch-constituents	Set up job	2026-02-06T19:38:07.8300720Z Ubuntu
fetch-constituents	Set up job	2026-02-06T19:38:07.8301155Z 24.04.3
fetch-constituents	Set up job	2026-02-06T19:38:07.8301691Z LTS
fetch-constituents	Set up job	2026-02-06T19:38:07.8302334Z ##[endgroup]
fetch-constituents	Set up job	2026-02-06T19:38:07.8302862Z ##[group]Runner Image
fetch-constituents	Set up job	2026-02-06T19:38:07.8303478Z Image: ubuntu-24.04
fetch-constituents	Set up job	2026-02-06T19:38:07.8303967Z Version: 20260201.15.1
fetch-constituents	Set up job	2026-02-06T19:38:07.8304973Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
fetch-constituents	Set up job	2026-02-06T19:38:07.8306658Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
fetch-constituents	Set up job	2026-02-06T19:38:07.8307529Z ##[endgroup]
fetch-constituents	Set up job	2026-02-06T19:38:07.8308571Z ##[group]GITHUB_TOKEN Permissions
fetch-constituents	Set up job	2026-02-06T19:38:07.8310627Z Contents: write
fetch-constituents	Set up job	2026-02-06T19:38:07.8311243Z Metadata: read
fetch-constituents	Set up job	2026-02-06T19:38:07.8311811Z ##[endgroup]
fetch-constituents	Set up job	2026-02-06T19:38:07.8314274Z Secret source: Actions
fetch-constituents	Set up job	2026-02-06T19:38:07.8315077Z Prepare workflow directory
fetch-constituents	Set up job	2026-02-06T19:38:07.8647774Z Prepare all required actions
fetch-constituents	Set up job	2026-02-06T19:38:07.8686972Z Getting action download info
fetch-constituents	Set up job	2026-02-06T19:38:08.2978329Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
fetch-constituents	Set up job	2026-02-06T19:38:08.3935485Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
fetch-constituents	Set up job	2026-02-06T19:38:08.5858208Z Complete job name: fetch-constituents
fetch-constituents	Checkout	﻿2026-02-06T19:38:08.6569721Z ##[group]Run actions/checkout@v4
fetch-constituents	Checkout	2026-02-06T19:38:08.6570632Z with:
fetch-constituents	Checkout	2026-02-06T19:38:08.6571100Z   repository: RubikVault/rubikvault-site
fetch-constituents	Checkout	2026-02-06T19:38:08.6571873Z   token: ***
fetch-constituents	Checkout	2026-02-06T19:38:08.6572485Z   ssh-strict: true
fetch-constituents	Checkout	2026-02-06T19:38:08.6572916Z   ssh-user: git
fetch-constituents	Checkout	2026-02-06T19:38:08.6573373Z   persist-credentials: true
fetch-constituents	Checkout	2026-02-06T19:38:08.6573858Z   clean: true
fetch-constituents	Checkout	2026-02-06T19:38:08.6574292Z   sparse-checkout-cone-mode: true
fetch-constituents	Checkout	2026-02-06T19:38:08.6574820Z   fetch-depth: 1
fetch-constituents	Checkout	2026-02-06T19:38:08.6575240Z   fetch-tags: false
fetch-constituents	Checkout	2026-02-06T19:38:08.6575677Z   show-progress: true
fetch-constituents	Checkout	2026-02-06T19:38:08.6576128Z   lfs: false
fetch-constituents	Checkout	2026-02-06T19:38:08.6576518Z   submodules: false
fetch-constituents	Checkout	2026-02-06T19:38:08.6576966Z   set-safe-directory: true
fetch-constituents	Checkout	2026-02-06T19:38:08.6577700Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:08.7646733Z Syncing repository: RubikVault/rubikvault-site
fetch-constituents	Checkout	2026-02-06T19:38:08.7648715Z ##[group]Getting Git version info
fetch-constituents	Checkout	2026-02-06T19:38:08.7649568Z Working directory is '/home/runner/work/rubikvault-site/rubikvault-site'
fetch-constituents	Checkout	2026-02-06T19:38:08.7650757Z [command]/usr/bin/git version
fetch-constituents	Checkout	2026-02-06T19:38:08.7756387Z git version 2.52.0
fetch-constituents	Checkout	2026-02-06T19:38:08.7781764Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:08.7795954Z Temporarily overriding HOME='/home/runner/work/_temp/71f66746-1129-4d4f-9e2d-7ede213810b8' before making global git config changes
fetch-constituents	Checkout	2026-02-06T19:38:08.7797869Z Adding repository directory to the temporary git global config as a safe directory
fetch-constituents	Checkout	2026-02-06T19:38:08.7808181Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
fetch-constituents	Checkout	2026-02-06T19:38:08.7846434Z Deleting the contents of '/home/runner/work/rubikvault-site/rubikvault-site'
fetch-constituents	Checkout	2026-02-06T19:38:08.7850012Z ##[group]Initializing the repository
fetch-constituents	Checkout	2026-02-06T19:38:08.7854015Z [command]/usr/bin/git init /home/runner/work/rubikvault-site/rubikvault-site
fetch-constituents	Checkout	2026-02-06T19:38:08.7957721Z hint: Using 'master' as the name for the initial branch. This default branch name
fetch-constituents	Checkout	2026-02-06T19:38:08.7959204Z hint: will change to "main" in Git 3.0. To configure the initial branch name
fetch-constituents	Checkout	2026-02-06T19:38:08.7960287Z hint: to use in all of your new repositories, which will suppress this warning,
fetch-constituents	Checkout	2026-02-06T19:38:08.7961980Z hint: call:
fetch-constituents	Checkout	2026-02-06T19:38:08.7962564Z hint:
fetch-constituents	Checkout	2026-02-06T19:38:08.7963272Z hint: 	git config --global init.defaultBranch <name>
fetch-constituents	Checkout	2026-02-06T19:38:08.7963955Z hint:
fetch-constituents	Checkout	2026-02-06T19:38:08.7964582Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
fetch-constituents	Checkout	2026-02-06T19:38:08.7965649Z hint: 'development'. The just-created branch can be renamed via this command:
fetch-constituents	Checkout	2026-02-06T19:38:08.7966754Z hint:
fetch-constituents	Checkout	2026-02-06T19:38:08.7967201Z hint: 	git branch -m <name>
fetch-constituents	Checkout	2026-02-06T19:38:08.7967681Z hint:
fetch-constituents	Checkout	2026-02-06T19:38:08.7968311Z hint: Disable this message with "git config set advice.defaultBranchName false"
fetch-constituents	Checkout	2026-02-06T19:38:08.7969454Z Initialized empty Git repository in /home/runner/work/rubikvault-site/rubikvault-site/.git/
fetch-constituents	Checkout	2026-02-06T19:38:08.7972039Z [command]/usr/bin/git remote add origin https://github.com/RubikVault/rubikvault-site
fetch-constituents	Checkout	2026-02-06T19:38:08.8009331Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:08.8010765Z ##[group]Disabling automatic garbage collection
fetch-constituents	Checkout	2026-02-06T19:38:08.8014553Z [command]/usr/bin/git config --local gc.auto 0
fetch-constituents	Checkout	2026-02-06T19:38:08.8046143Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:08.8047589Z ##[group]Setting up auth
fetch-constituents	Checkout	2026-02-06T19:38:08.8053741Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
fetch-constituents	Checkout	2026-02-06T19:38:08.8087167Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
fetch-constituents	Checkout	2026-02-06T19:38:08.8426927Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
fetch-constituents	Checkout	2026-02-06T19:38:08.8455539Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
fetch-constituents	Checkout	2026-02-06T19:38:08.8675862Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
fetch-constituents	Checkout	2026-02-06T19:38:08.8711097Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
fetch-constituents	Checkout	2026-02-06T19:38:08.8975651Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
fetch-constituents	Checkout	2026-02-06T19:38:08.9014103Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:08.9015047Z ##[group]Fetching the repository
fetch-constituents	Checkout	2026-02-06T19:38:08.9026674Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb:refs/remotes/origin/main
fetch-constituents	Checkout	2026-02-06T19:38:10.6491435Z From https://github.com/RubikVault/rubikvault-site
fetch-constituents	Checkout	2026-02-06T19:38:10.6494293Z  * [new ref]         c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb -> origin/main
fetch-constituents	Checkout	2026-02-06T19:38:10.6524439Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:10.6526098Z ##[group]Determining the checkout info
fetch-constituents	Checkout	2026-02-06T19:38:10.6527462Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:10.6530970Z [command]/usr/bin/git sparse-checkout disable
fetch-constituents	Checkout	2026-02-06T19:38:10.6572290Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
fetch-constituents	Checkout	2026-02-06T19:38:10.6600328Z ##[group]Checking out the ref
fetch-constituents	Checkout	2026-02-06T19:38:10.6604526Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
fetch-constituents	Checkout	2026-02-06T19:38:11.0861883Z Switched to a new branch 'main'
fetch-constituents	Checkout	2026-02-06T19:38:11.0864285Z branch 'main' set up to track 'origin/main'.
fetch-constituents	Checkout	2026-02-06T19:38:11.0900338Z ##[endgroup]
fetch-constituents	Checkout	2026-02-06T19:38:11.0945148Z [command]/usr/bin/git log -1 --format=%H
fetch-constituents	Checkout	2026-02-06T19:38:11.0970582Z c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb
fetch-constituents	Setup Node	﻿2026-02-06T19:38:11.1208513Z ##[group]Run actions/setup-node@v4
fetch-constituents	Setup Node	2026-02-06T19:38:11.1208849Z with:
fetch-constituents	Setup Node	2026-02-06T19:38:11.1209033Z   node-version: 20
fetch-constituents	Setup Node	2026-02-06T19:38:11.1209246Z   always-auth: false
fetch-constituents	Setup Node	2026-02-06T19:38:11.1209459Z   check-latest: false
fetch-constituents	Setup Node	2026-02-06T19:38:11.1209799Z   token: ***
fetch-constituents	Setup Node	2026-02-06T19:38:11.1209988Z ##[endgroup]
fetch-constituents	Setup Node	2026-02-06T19:38:11.2964201Z Found in cache @ /opt/hostedtoolcache/node/20.20.0/x64
fetch-constituents	Setup Node	2026-02-06T19:38:11.2969421Z ##[group]Environment details
fetch-constituents	Setup Node	2026-02-06T19:38:11.6282807Z node: v20.20.0
fetch-constituents	Setup Node	2026-02-06T19:38:11.6283322Z npm: 10.8.2
fetch-constituents	Setup Node	2026-02-06T19:38:11.6283646Z yarn: 1.22.22
fetch-constituents	Setup Node	2026-02-06T19:38:11.6284493Z ##[endgroup]
fetch-constituents	Fetch Index Constituents	﻿2026-02-06T19:38:11.6393514Z ##[group]Run node scripts/universe/fetch-constituents.mjs
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6394005Z [36;1mnode scripts/universe/fetch-constituents.mjs[0m
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6437533Z shell: /usr/bin/bash -e {0}
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6437852Z env:
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6438142Z   EODHD_API_KEY: ***
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6438356Z ##[endgroup]
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6782276Z ══════════════════════════════════════════════════
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6783314Z 🌐 EODHD Index Constituents Fetcher
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6783894Z ══════════════════════════════════════════════════
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6784168Z 
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.6784471Z 📊 Fetching S&P 500 (GSPC.INDX)...
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:11.9919811Z   Attempt 1/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:13.0601291Z   Attempt 2/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:15.2582930Z   Attempt 3/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:15.2584047Z   ❌ Failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:15.2584412Z 
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:15.2585043Z 📊 Fetching Dow Jones 30 (DJI.INDX)...
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:15.4647107Z   Attempt 1/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:16.5280702Z   Attempt 2/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:18.6020707Z   Attempt 3/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:18.6021816Z   ❌ Failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:18.6022378Z 
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:18.6023070Z 📊 Fetching NASDAQ-100 (NDX.INDX)...
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:18.6582462Z   Attempt 1/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:19.7128305Z   Attempt 2/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:21.8138936Z   Attempt 3/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:21.8139890Z   ❌ Failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:21.8140208Z 
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:21.8140507Z 📊 Fetching Russell 2000 (RUT.INDX)...
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:21.9008615Z   Attempt 1/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:22.9610366Z   Attempt 2/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0158951Z   Attempt 3/3 failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0159442Z 
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0159877Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0160314Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0160692Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0161041Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0161501Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0161883Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0162483Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0162809Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0163147Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0163618Z   ❌ Failed: HTTP 403: Forbidden
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0164037Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0164378Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0164659Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0164932Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0165204Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0165481Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0165786Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0166101Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0166385Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0166713Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0167011Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0167306Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0167614Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0167913Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0168205Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0168494Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0168786Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0169115Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0169415Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0169712Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0170002Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0170299Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0170600Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0170914Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0171217Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0171510Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0171799Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0172269Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0172593Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0172898Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0173199Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0173497Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0173779Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0174074Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0174367Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0174664Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0174960Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0175259Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0175554Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0175851Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0176139Z ═
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0176453Z ✅ DONE
fetch-constituents	Fetch Index Constituents	2026-02-06T19:38:25.0177069Z ══════════════════════════════════════════════════
fetch-constituents	Show Results	﻿2026-02-06T19:38:25.0243464Z ##[group]Run echo "Universe files created:"
fetch-constituents	Show Results	2026-02-06T19:38:25.0243818Z [36;1mecho "Universe files created:"[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0244091Z [36;1mls -la public/data/universe/[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0308777Z [36;1mecho ""[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0309018Z [36;1mecho "Symbol counts:"[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0309308Z [36;1mfor f in public/data/universe/*.json; do[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0309629Z [36;1m  count=$(jq 'length' "$f")[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0309942Z [36;1m  echo "  $(basename $f): $count symbols"[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0310252Z [36;1mdone[0m
fetch-constituents	Show Results	2026-02-06T19:38:25.0342361Z shell: /usr/bin/bash -e {0}
fetch-constituents	Show Results	2026-02-06T19:38:25.0342601Z ##[endgroup]
fetch-constituents	Show Results	2026-02-06T19:38:25.0395078Z Universe files created:
fetch-constituents	Show Results	2026-02-06T19:38:25.0408813Z total 28
fetch-constituents	Show Results	2026-02-06T19:38:25.0409344Z drwxr-xr-x  2 runner runner 4096 Feb  6 19:38 .
fetch-constituents	Show Results	2026-02-06T19:38:25.0409958Z drwxr-xr-x 14 runner runner 4096 Feb  6 19:38 ..
fetch-constituents	Show Results	2026-02-06T19:38:25.0410703Z -rw-r--r--  1 runner runner  409 Feb  6 19:38 dowjones.json
fetch-constituents	Show Results	2026-02-06T19:38:25.0411561Z -rw-r--r--  1 runner runner 5886 Feb  6 19:38 nasdaq100.json
fetch-constituents	Show Results	2026-02-06T19:38:25.0412494Z -rw-r--r--  1 runner runner   77 Feb  6 19:38 russell2000.json
fetch-constituents	Show Results	2026-02-06T19:38:25.0413259Z -rw-r--r--  1 runner runner  370 Feb  6 19:38 sp500.json
fetch-constituents	Show Results	2026-02-06T19:38:25.0413530Z 
fetch-constituents	Show Results	2026-02-06T19:38:25.0413630Z Symbol counts:
fetch-constituents	Show Results	2026-02-06T19:38:25.0450822Z   dowjones.json: 5 symbols
fetch-constituents	Show Results	2026-02-06T19:38:25.0489611Z   nasdaq100.json: 100 symbols
fetch-constituents	Show Results	2026-02-06T19:38:25.0526976Z   russell2000.json: 1 symbols
fetch-constituents	Show Results	2026-02-06T19:38:25.0563894Z   sp500.json: 5 symbols
fetch-constituents	Commit Changes	﻿2026-02-06T19:38:25.0590295Z ##[group]Run git config --global user.name "rv-bot"
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0590701Z [36;1mgit config --global user.name "rv-bot"[0m
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0591062Z [36;1mgit config --global user.email "bot@rubikvault.com"[0m
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0591393Z [36;1mgit add public/data/universe/[0m
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0591848Z [36;1mgit commit -m "chore(universe): refresh index constituents [skip ci]" || echo "No changes"[0m
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0592548Z [36;1mgit push[0m
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0621353Z shell: /usr/bin/bash -e {0}
fetch-constituents	Commit Changes	2026-02-06T19:38:25.0621656Z ##[endgroup]
fetch-constituents	Commit Changes	2026-02-06T19:38:25.1434286Z On branch main
fetch-constituents	Commit Changes	2026-02-06T19:38:25.1434867Z Your branch is up to date with 'origin/main'.
fetch-constituents	Commit Changes	2026-02-06T19:38:25.1435161Z 
fetch-constituents	Commit Changes	2026-02-06T19:38:25.1435358Z nothing to commit, working tree clean
fetch-constituents	Commit Changes	2026-02-06T19:38:25.1436780Z No changes
fetch-constituents	Commit Changes	2026-02-06T19:38:25.4024239Z Everything up-to-date
fetch-constituents	Post Setup Node	﻿2026-02-06T19:38:25.4120458Z Post job cleanup.
fetch-constituents	Post Checkout	﻿2026-02-06T19:38:25.5802690Z Post job cleanup.
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6745735Z [command]/usr/bin/git version
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6781431Z git version 2.52.0
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6819249Z Copying '/home/runner/.gitconfig' to '/home/runner/work/_temp/924fe380-9a49-4a1b-add1-0e009158ca55/.gitconfig'
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6829381Z Temporarily overriding HOME='/home/runner/work/_temp/924fe380-9a49-4a1b-add1-0e009158ca55' before making global git config changes
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6830895Z Adding repository directory to the temporary git global config as a safe directory
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6835508Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/rubikvault-site/rubikvault-site
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6877106Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
fetch-constituents	Post Checkout	2026-02-06T19:38:25.6909785Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
fetch-constituents	Post Checkout	2026-02-06T19:38:25.7140491Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
fetch-constituents	Post Checkout	2026-02-06T19:38:25.7160433Z http.https://github.com/.extraheader
fetch-constituents	Post Checkout	2026-02-06T19:38:25.7173492Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
fetch-constituents	Post Checkout	2026-02-06T19:38:25.7203695Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
fetch-constituents	Post Checkout	2026-02-06T19:38:25.7426243Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
fetch-constituents	Post Checkout	2026-02-06T19:38:25.7456884Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
fetch-constituents	Complete job	﻿2026-02-06T19:38:25.7788857Z Cleaning up orphan processes
log_capture=ok
```

### WORKFLOW: Monitor Production Artifacts
```
latest_run_id=21895644780
liveness	Set up job	﻿2026-02-11T06:55:39.6896495Z Current runner version: '2.331.0'
liveness	Set up job	2026-02-11T06:55:39.6919734Z ##[group]Runner Image Provisioner
liveness	Set up job	2026-02-11T06:55:39.6920867Z Hosted Compute Agent
liveness	Set up job	2026-02-11T06:55:39.6921826Z Version: 20260123.484
liveness	Set up job	2026-02-11T06:55:39.6922689Z Commit: 6bd6555ca37d84114959e1c76d2c01448ff61c5d
liveness	Set up job	2026-02-11T06:55:39.6924070Z Build Date: 2026-01-23T19:41:17Z
liveness	Set up job	2026-02-11T06:55:39.6925151Z Worker ID: {98aa0b29-4778-44b4-8f6f-29e5f4d2e559}
liveness	Set up job	2026-02-11T06:55:39.6926224Z Azure Region: eastus2
liveness	Set up job	2026-02-11T06:55:39.6927016Z ##[endgroup]
liveness	Set up job	2026-02-11T06:55:39.6929137Z ##[group]Operating System
liveness	Set up job	2026-02-11T06:55:39.6930008Z Ubuntu
liveness	Set up job	2026-02-11T06:55:39.6930825Z 24.04.3
liveness	Set up job	2026-02-11T06:55:39.6931627Z LTS
liveness	Set up job	2026-02-11T06:55:39.6932293Z ##[endgroup]
liveness	Set up job	2026-02-11T06:55:39.6933294Z ##[group]Runner Image
liveness	Set up job	2026-02-11T06:55:39.6934248Z Image: ubuntu-24.04
liveness	Set up job	2026-02-11T06:55:39.6935178Z Version: 20260201.15.1
liveness	Set up job	2026-02-11T06:55:39.6936881Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260201.15/images/ubuntu/Ubuntu2404-Readme.md
liveness	Set up job	2026-02-11T06:55:39.6939754Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260201.15
liveness	Set up job	2026-02-11T06:55:39.6941350Z ##[endgroup]
liveness	Set up job	2026-02-11T06:55:39.6946019Z ##[group]GITHUB_TOKEN Permissions
liveness	Set up job	2026-02-11T06:55:39.6948680Z Actions: write
liveness	Set up job	2026-02-11T06:55:39.6949699Z ArtifactMetadata: write
liveness	Set up job	2026-02-11T06:55:39.6950655Z Attestations: write
liveness	Set up job	2026-02-11T06:55:39.6951551Z Checks: write
liveness	Set up job	2026-02-11T06:55:39.6952428Z Contents: write
liveness	Set up job	2026-02-11T06:55:39.6953629Z Deployments: write
liveness	Set up job	2026-02-11T06:55:39.6954523Z Discussions: write
liveness	Set up job	2026-02-11T06:55:39.6955484Z Issues: write
liveness	Set up job	2026-02-11T06:55:39.6956313Z Metadata: read
liveness	Set up job	2026-02-11T06:55:39.6957155Z Models: read
liveness	Set up job	2026-02-11T06:55:39.6958078Z Packages: write
liveness	Set up job	2026-02-11T06:55:39.6958916Z Pages: write
liveness	Set up job	2026-02-11T06:55:39.6959901Z PullRequests: write
liveness	Set up job	2026-02-11T06:55:39.6960812Z RepositoryProjects: write
liveness	Set up job	2026-02-11T06:55:39.6961968Z SecurityEvents: write
liveness	Set up job	2026-02-11T06:55:39.6962821Z Statuses: write
liveness	Set up job	2026-02-11T06:55:39.6963798Z ##[endgroup]
liveness	Set up job	2026-02-11T06:55:39.6966693Z Secret source: Actions
liveness	Set up job	2026-02-11T06:55:39.6967867Z Prepare workflow directory
liveness	Set up job	2026-02-11T06:55:39.7414621Z Prepare all required actions
liveness	Set up job	2026-02-11T06:55:39.7552814Z Complete job name: liveness
liveness	Ensure jq	﻿2026-02-11T06:55:39.8343513Z ##[group]Run if ! command -v jq >/dev/null 2>&1; then
liveness	Ensure jq	2026-02-11T06:55:39.8344498Z [36;1mif ! command -v jq >/dev/null 2>&1; then[0m
liveness	Ensure jq	2026-02-11T06:55:39.8345183Z [36;1m  sudo apt-get update[0m
liveness	Ensure jq	2026-02-11T06:55:39.8345708Z [36;1m  sudo apt-get install -y jq[0m
liveness	Ensure jq	2026-02-11T06:55:39.8346370Z [36;1mfi[0m
liveness	Ensure jq	2026-02-11T06:55:39.8346797Z [36;1mjq --version[0m
liveness	Ensure jq	2026-02-11T06:55:39.8711661Z shell: /usr/bin/bash -e {0}
liveness	Ensure jq	2026-02-11T06:55:39.8713284Z ##[endgroup]
liveness	Ensure jq	2026-02-11T06:55:39.8919403Z jq-1.7
liveness	Check required artifact endpoints	﻿2026-02-11T06:55:39.9017978Z ##[group]Run set -euo pipefail
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9018684Z [36;1mset -euo pipefail[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9019289Z [36;1m[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9019789Z [36;1mfetch_json() {[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9020311Z [36;1m  local url="$1"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9020882Z [36;1m  local out="$2"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9021396Z [36;1m  echo "Checking $url"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9021964Z [36;1m  curl -fsS "$url" -o "$out"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9022496Z [36;1m  jq -e . "$out" >/dev/null[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9023318Z [36;1m  echo "✅ $url"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9023797Z [36;1m}[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9024248Z [36;1m[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9025103Z [36;1mfetch_json "$BASE_URL/data/snapshots/market-prices/latest.json" /tmp/market_prices.json[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9026209Z [36;1mfetch_json "$BASE_URL/data/forecast/latest.json" /tmp/forecast_latest.json[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9027253Z [36;1mfetch_json "$BASE_URL/data/forecast/system/status.json" /tmp/forecast_status.json[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9028344Z [36;1m[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9028898Z [36;1mjq -e --argjson minRows "$MIN_MARKET_PRICE_ROWS" '[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9029722Z [36;1m  ((.schema_version // .schemaVersion // .schema) != null) and[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9030563Z [36;1m  ((.asof // .metadata.as_of // .meta.asOf) != null) and[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9031639Z [36;1m  (((.metadata.record_count // 0) >= $minRows) or ((.data | length) >= $minRows))[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9032600Z [36;1m' /tmp/market_prices.json >/dev/null[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9033492Z [36;1mecho "✅ market-prices semantic checks passed"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9034108Z [36;1m[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9034584Z [36;1mjq -e '[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9035187Z [36;1m  ((.schema_version // .schemaVersion // .schema) != null) and[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9036049Z [36;1m  ((.data.asof // .asof // .meta.asof // .meta.data_date) != null) and[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9036895Z [36;1m  ((.data.forecasts | length) > 0)[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9037525Z [36;1m' /tmp/forecast_latest.json >/dev/null[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9038234Z [36;1mecho "✅ forecast/latest semantic checks passed"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9038829Z [36;1m[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9039335Z [36;1mjq -e '[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9040119Z [36;1m  ((.schema_version // .schemaVersion // .schema) != null) and[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9040946Z [36;1m  ((.status // .meta.status) != null) and[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9041837Z [36;1m  (if (((.status // .meta.status // "") | ascii_downcase) == "circuit_open" or[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9042759Z [36;1m       (((.circuit_state // .circuit.state // "") | ascii_downcase) == "open"))[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9044021Z [36;1m   then ((.reason // .message // .meta.reason // "") | tostring | length) > 0[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9044886Z [36;1m   else true[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9045346Z [36;1m   end)[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9045976Z [36;1m' /tmp/forecast_status.json >/dev/null[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9046798Z [36;1mecho "✅ forecast/system/status semantic checks passed"[0m
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9077276Z shell: /usr/bin/bash -e {0}
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9077861Z env:
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9078308Z   BASE_URL: https://rubikvault.com
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9078969Z   MIN_MARKET_PRICE_ROWS: 517
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9079472Z ##[endgroup]
liveness	Check required artifact endpoints	2026-02-11T06:55:39.9204208Z Checking https://rubikvault.com/data/snapshots/market-prices/latest.json
liveness	Check required artifact endpoints	2026-02-11T06:55:40.0042455Z curl: (22) The requested URL returned error: 403
liveness	Check required artifact endpoints	2026-02-11T06:55:40.0070531Z ##[error]Process completed with exit code 22.
liveness	Complete job	﻿2026-02-11T06:55:40.0143791Z Cleaning up orphan processes
log_capture=ok
```
