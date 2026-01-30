<!--
Scheduler execution model (main@cb10536):
- Primary: GitHub Actions schedule (scheduler-kick.yml) POSTs /api/scheduler/run on prod base.
- Manual: POST /api/scheduler/run with admin token (X-Admin-Token or Authorization: Bearer).
- No Cloudflare Scheduled Event wiring in this repo.
-->
