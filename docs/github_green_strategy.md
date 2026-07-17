# GitHub Strategy: How to Build Your Multi-Vendor Marketplace with a Green & Genuine Graph

This guide outlines a professional development workflow tailored for your **Multi-Vendor Fashion Marketplace** monorepo. Following these practices will help you build a highly active, professional, and authentic GitHub contribution history (the "green squares") while ensuring your repository's code quality remains pristine.

---

## 1. Mechanics of the GitHub Contribution Graph

To ensure your work is recorded correctly on your GitHub contribution graph, keep these rules in mind:

1. **Email Alignment**: Your local Git config email **must** match the email address associated with your GitHub account.

   ```bash
   # Check your current Git config email
   git config --global user.email

   # If it doesn't match your GitHub email, set it:
   git config --global user.email "your-github-email@example.com"
   ```

2. **What Counts as a Contribution?**:
   - **Commits** pushed to the repository's default branch (`main`) or any branch.
   - **Pull Requests (PRs)** opened, reviewed, or merged.
   - **Issues** opened or closed.
3. **Commit Date vs. Push Date**: Commits are plotted on your contribution graph based on the **author date** (when you ran `git commit`), not the push date. Pushing multiple days of offline commits at once will backfill the graph for the days you authored them.

---

## 2. The Micro-Commit Strategy (Going "Green")

Professional developers do not write code for two weeks and push one massive commit labeled "added backend". Doing so makes your contribution graph look inactive and makes code reviews nearly impossible.

Instead, practice **micro-commits**—breaking down features into atomic, logical, and self-contained units. This naturally increases commit frequency, making your graph consistently green.

### Practical Example: Implementing the Identity Module (Week 3)

Instead of committing the entire Identity module at once, break it down like this over 2–3 days:

| Task / Step              | Suggested Commit Message                                           | Target Files                            |
| :----------------------- | :----------------------------------------------------------------- | :-------------------------------------- |
| **Step 1: Schemas**      | `feat(types): define auth zod schemas and types`                   | `packages/types/src/auth.ts`            |
| **Step 2: Constants**    | `feat(constants): add auth status codes and response envelopes`    | `packages/constants/src/auth.ts`        |
| **Step 3: DB Migration** | `feat(api): create prisma migrations for users and sessions`       | `apps/api/prisma/...`                   |
| **Step 4: Redis Client** | `feat(api): configure redis client and connection pool`            | `apps/api/src/redis/...`                |
| **Step 5: OTP Service**  | `feat(api): implement OTP generation and redis-throttled resend`   | `apps/api/src/auth/otp.service.ts`      |
| **Step 6: OTP Tests**    | `test(api): add unit tests for OTP generation and throttling`      | `apps/api/src/auth/otp.service.spec.ts` |
| **Step 7: OTP Endpoint** | `feat(api): implement OTP request and verification controllers`    | `apps/api/src/auth/auth.controller.ts`  |
| **Step 8: E2E Tests**    | `test(api): add integration E2E tests for OTP authentication flow` | `apps/api/test/auth.e2e-spec.ts`        |

By separating these steps, you will make **8 high-quality commits** rather than 1, showing active daily engagement.

---

## 3. The Professional Git Workflow (Going "Genuine")

A "genuine" GitHub repository is structured, readable, and follows industry standards. Avoid committing directly to `main`. Instead, follow the **Feature Branch Workflow**.

### 1. The Conventional Commit Standard

Format your commit messages according to the [Conventional Commits](https://www.conventionalcommits.org/) specification:
`[type]([optional-scope]): [description]`

- **`feat:`**: A new feature (e.g., `feat(catalog): add SKU availability checks`)
- **`fix:`**: A bug fix (e.g., `fix(auth): resolve OTP verification expiration logic`)
- **`docs:`**: Documentation changes (e.g., `docs(decisions): add ADR-009 for BullMQ integration`)
- **`style:`**: Changes that do not affect the meaning of the code (formatting, missing semi-colons, etc.)
- **`refactor:`**: A code change that neither fixes a bug nor adds a feature (e.g., `refactor(db): rewrite ledger queries for speed`)
- **`test:`**: Adding or correcting tests (e.g., `test(inventory): add concurrency checkout tests`)
- **`chore:`**: Updating build tasks, package manager configs, etc. (e.g., `chore(deps): update nestjs packages`)

### 2. Working on Feature Branches

For each task or module:

1. Create a new branch: `git checkout -b feature/auth-otp`
2. Work on your feature, making micro-commits.
3. Push your branch: `git push origin feature/auth-otp`
4. Go to GitHub and open a **Pull Request (PR)** to merge into `main`.

### 3. Creating Quality Pull Requests

When you open a PR on GitHub, do not leave the description blank. Use a template that explains:

- **What was changed?** (Short summary or bullet list)
- **How was it tested?** (List tests run or include a screenshot/log)
- **Linked Issues** (e.g., `Closes #12`)

_Opening, commenting on, and merging PRs are all counted as high-value contributions on your graph!_

---

## 4. Track Work with GitHub Issues & Project Boards

Using GitHub's built-in issue tracker and Kanban project boards makes your development flow transparent and professional.

1. **Create GitHub Issues**:
   - Turn each item in `docs/final-implementation-plan-v1.md` into a GitHub Issue (e.g., Issue #1: "Setup identity module and OTP generation").
   - Define a checklist inside the issue description.
2. **Reference Issues in Commits**:
   - Reference the issue ID in your commit messages:
     `feat(auth): implement OTP generation with redis throttle (refs #1)`
3. **Automate Closing**:
   - When submitting the PR that completes the issue, reference it using closing keywords in the PR description:
     `closes #1`
   - When the PR is merged, GitHub will automatically close the issue and update your graph.

---

## 5. Setting up local and CI Quality Gates

A genuine repository has automated quality gates. Let's make sure code matches TS strict mode, formatting rules, and passes tests before merging.

### 1. Add Git Hooks (Husky)

You can set up `husky` and `lint-staged` to run automatic checks on every commit. This guarantees that you never commit broken TypeScript code or unformatted files.

Run these in the project root:

```bash
# Add husky
pnpm add -D husky lint-staged
npx husky init

# Add a pre-commit hook that runs format and check-types
echo "pnpm run format && pnpm run lint" > .husky/pre-commit
```

### 2. GitHub Actions (CI/CD)

Create a `.github/workflows/ci.yml` file to run tests on every push or PR:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Linter & Typecheck
        run: pnpm run lint && pnpm run check-types

      - name: Run Tests
        run: pnpm run test
```

Having a green checkmark next to your commits on GitHub instantly elevates the credibility of your profile.

---

## 6. Action Plan to Start

Here are your exact next steps to kick off this workflow:

1. **Verify your local Git identity**:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your-email@users.noreply.github.com" # Or your primary GitHub email
   ```
2. **Create your repository on GitHub**:
   - Go to GitHub, create a new private or public repository named `Multi-Vendor-Fashion-Application` or `marketplace`.
   - Run:
     ```bash
     git remote add origin https://github.com/enigmaAditya/Multi-Vendor-Fashion-Application.git
     git branch -M main
     git push -u origin main
     ```
3. **Map the Final Implementation Plan**:
   - Open GitHub Issues for **Identity (Week 3)**, **Catalog (Week 4)**, and **Media (Week 4)**.
4. **Create your first feature branch**:
   - Next task is setting up the databases or auth logic.
   - Run `git checkout -b feature/auth-scaffold` and begin!
