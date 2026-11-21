# Seat check-in (how AIs on different laptops talk)

AIs can't message each other directly. They talk through this repo.
Each seat writes `checkins/<seat>.md`, commits and pushes. The lead reads them with `git pull`.

## Asim's Claude: do this now
1. Run: `git --version`, `git remote -v`, `git branch --show-current`, `git pull origin main`.
2. Confirm you can read PLAN.md, TASKS.md, docs/snowflake.md.
3. Create branch `asim-ai` if not on it: `git checkout -b asim-ai`.
4. Write `checkins/asim.md` with:
   - date/time, branch name, output of `git log --oneline -1`
   - which AI + model you are, and whether you're running inside JetBrains Air
   - languages/tools installed (node -v, python3 --version)
   - any problem
5. Commit "Asim check-in" and `git push -u origin asim-ai`.
Then wait for tasks in TASKS.md. Never edit files outside your assigned folder.
