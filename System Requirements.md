# Build eShareGoal — A Collaborative Goal-Tracking Web Application

Act as a senior full-stack developer, UI/UX designer, and software architect. Build a modern, responsive, and functional web application called **eShareGoal**.

Do not just describe the application or provide a static mockup. Implement the website with working navigation, interactive components, forms, dialogs, expandable sections, calculations, and persistent demo data.

## 1. Product Overview

eShareGoal is a collaborative platform where people can create groups, share information, track progress, and work toward common goals.

The application must support multiple types of goals, not just financial tracking.

Example use cases:

- A family sharing the payments for a car loan.
- Friends saving money for a house or vacation.
- A family tracking a shared emergency fund.
- Friends tracking a fitness or diet challenge.
- A team managing tasks and project milestones.
- Users creating their own custom goals.

The core architecture must be based on three concepts:

1. **Groups:** People who collaborate in a shared workspace.
2. **Goals:** Objectives belonging to a group.
3. **Records:** Data and activities that track progress toward a goal.

A single group can contain multiple goals. Each goal should have its own configuration, progress dashboard, records, milestones, and members where applicable.

## 2. Design and User Experience

Create a premium SaaS dashboard with a clean, modern, professional appearance.

Design direction:

- Use a minimalist dashboard layout inspired by Linear, Notion, Stripe, and modern financial applications.
- Use a light theme by default with a fully functional dark theme.
- Use a consistent spacing system, rounded cards, subtle borders, restrained shadows, readable typography, and attractive data visualizations.
- Use Lucide icons or an equivalent icon library.
- Use green for positive financial progress, red for expenses or overdue items, amber for pending transactions, and neutral colors for general information.
- Avoid excessive gradients, oversized text, distracting animations, or unnecessary decorative elements.
- Make the interface responsive for desktop, tablet, and mobile.
- Include loading, empty, success, validation, and error states where appropriate.

Use realistic sample data so the website feels populated and functional immediately.

## 3. Application Layout

Build a dashboard shell containing:

### Sidebar

- eShareGoal logo and application name.
- Dashboard.
- My Groups.
- Goals or All Goals.
- Activity History.
- Notifications.
- Integrations.
- Settings.
- User profile and account menu.

Groups must appear as expandable accordion items in the sidebar.

For example:

Family

- Car Credit
- Emergency Fund
- Family Fitness

Friends

- Vacation Fund
- 30-Day Fitness Challenge

Clicking a group should open its overview. Clicking a goal should navigate to that specific goal's dashboard.

Include a button to create a new group and a button to create a new goal.

### Top Navigation

- Breadcrumb navigation.
- Current group or goal name.
- Search or quick-action control.
- Notifications icon with an unread indicator.
- Light/dark theme toggle.
- User profile menu.

On mobile, collapse the sidebar into a drawer or responsive navigation menu.

## 4. Main Dashboard

The primary dashboard should display:

- A welcome message.
- Overview of the user's groups and active goals.
- Total number of active goals.
- Overall progress summaries where the metrics can meaningfully be combined.
- Recently updated goals.
- Upcoming deadlines and reminders.
- Recent group activities.
- Pending transaction reviews.
- Quick actions for creating groups, goals, and records.

Each group or goal card should display an icon, title, progress, relevant metrics, last activity, and a link to its details.

Do not combine unrelated metrics into misleading totals. For example, money saved and kilograms lost must remain separate measurements.

## 5. Group Management

Implement complete front-end functionality for creating, viewing, editing, and deleting groups.

Each group should have:

- Group name.
- Description.
- Icon or avatar.
- Creation date.
- Members.
- Member roles.
- Group settings.
- Goals belonging to the group.
- Recent activity.
- Invitation interface or invitation-code placeholder.

Support these roles:

- Owner.
- Administrator.
- Member.
- Viewer.

Implement role-aware UI where practical. Clearly distinguish between permissions enforced in the prototype and actual server-side authorization, which will require a backend.

Provide confirmation dialogs for destructive actions.

## 6. Flexible Goal Creation System

Create a polished multi-step or modal-based goal creation form.

The user should select one of the following templates:

### A. Shared Money

Track savings, shared contributions, deposits, withdrawals, expenses, and available balances.

### B. Loan and Installments

Track loan amounts, installment schedules, payments, due dates, and remaining loan balances.

### C. Fitness and Health

Track personal metrics, weight changes, exercise, habits, and weekly progress updates.

### D. Tasks and Milestones

Track assigned tasks, deadlines, completion status, and project milestones.

### E. Custom Goal

Allow users to define a goal name, target value, unit, deadline, and custom progress records.

Each template must provide the appropriate form fields and dashboard layout.

For every goal, allow the user to configure:

- Goal name and description.
- Group.
- Goal type.
- Icon.
- Target value and unit.
- Start date and deadline.
- Members or participants.
- Progress-tracking method.
- Milestones.
- Reminder preferences.
- Custom notes.
- Goal status: Active, Paused, Completed, or Archived.

When a goal is opened, display a dedicated dashboard appropriate to its type.

Avoid hard-coding every goal as a financial goal. Design reusable components and a flexible data model that allow future goal templates to be added.

## 7. Car Credit Dashboard — The Primary Use Case

Create a polished financial tracking dashboard for a group called "Family" with a goal named "Car Credit."

Use these sample members:

- Bernz.
- Babylyn.
- Billy.

Use clearly labeled fictional demo data for all amounts and payment history.

### Financial Summary Cards

Display:

1. Total Contributions.
2. Available Group Funds.
3. Total Paid to Lender.
4. Installments Completed, such as 11/60.
5. Remaining Loan Balance.
6. Next Payment Due.

All figures must be calculated from the underlying demo records.

Keep these financial concepts separate:

- Member contributions are money deposited into the shared fund.
- Available funds are the current amount remaining in the shared fund.
- Loan payments are confirmed payments made to the lender.
- Outstanding loan balance is the amount remaining on the loan, based on verified lender data or a configured repayment schedule.

Do not calculate outstanding debt using member contributions.

If the data needed to calculate an amount is missing, show an appropriate unavailable state rather than inventing a figure.

### Charts

Add:

- Monthly contributions chart.
- Loan repayment progress.
- Contributions by member.
- Incoming deposits versus outgoing expenses.
- Payment history timeline.

All charts must use the actual application state and update when records are added or edited.

### Member Contributions Table

Create an expandable table with one accordion row per member.

Example:

| Member | Total Contributed | Records | Latest Activity |
| Bernz | Calculated value | Count | Date |
| Babylyn | Calculated value | Count | Date |
| Billy | Calculated value | Count | Date |

Expanding a member must show a detailed list of their transactions, including:

- Amount.
- Date and time.
- Transaction type.
- Payment method.
- Reference number when available.
- Status.
- Notes.
- Source: Manual or Imported.

Add actions to create, edit, view, and correct records, subject to the displayed permissions.

### Transaction Management

Add a transaction history table with filters for:

- Member.
- Date range.
- Transaction type.
- Status.
- Source.

Add search, sorting, pagination if needed, and an export-to-CSV action.

Provide an "Add Transaction" dialog containing:

- Member.
- Amount.
- Transaction type.
- Transaction date.
- Payment method.
- Reference number.
- Notes.

Validate forms, update totals immediately, and persist the changes.

Create an audit-history mechanism in the prototype so record edits and status changes can be reviewed. Use an append-only correction history or reversal record instead of silently overwriting confirmed financial history.

## 8. Gmail Integration and Automatic Transaction Import

Create a dedicated Integrations page and transaction-import review interface.

The purpose is to let an authorized user connect Gmail, find bank notification emails, extract transaction details, identify the related group member, and propose financial records.

### Integration Settings

Allow users to configure:

- Connected Gmail account status.
- Email filters.
- Bank or provider, including BPI.
- Sender and subject filters.
- Gmail search query.
- Matching account suffix, such as the last four digits.
- Account holder name and aliases.
- Expected transaction direction.
- Amount matching rules.
- Reference-number matching.
- Member assignment.
- Destination group and goal.
- Default note.
- Synchronization frequency.
- Last successful synchronization.
- Next scheduled synchronization.
- Import history and errors.

### Transaction Import Workflow

Implement this workflow:

1. Find relevant messages.
2. Extract available transaction details.
3. Identify the likely sender or recipient.
4. Match the candidate to a group member using configurable rules.
5. Detect potential duplicates.
6. Place uncertain candidates in a review queue.
7. Allow the user to confirm, reject, or correct the candidate.
8. Once confirmed, create the financial record and recalculate the dashboard.

Each candidate should display:

- Extracted amount.
- Transaction date.
- Reference number.
- Available account suffix.
- Proposed member.
- Proposed goal.
- Match confidence or match rationale.
- Review status.
- Source message reference.

Use these statuses:

- Detected.
- Pending Review.
- Confirmed.
- Rejected.
- Duplicate.
- Error.

**Important implementation constraint:** Do not pretend a Gmail account is actually connected when it is not. Do not fabricate real BPI data or successful bank synchronization.

For the initial website, build a working integration UI with a mock Gmail service and fictional sample transaction emails. Implement the parsing and matching logic against those samples, including duplicate detection and manual review.

Structure the integration behind a replaceable service or adapter. Document how real Google OAuth, the Gmail API, secure token storage, and a scheduled worker can be added through a backend.

Never put OAuth client secrets or refresh tokens in frontend code. Clearly indicate that real bank-data access depends on supported bank services and authorization; do not imply that access to Gmail automatically provides direct bank-account access.

## 9. Scheduling and Automation Settings

Build an Automation Settings page where users can configure recurring synchronization.

Provide:

- Enable or disable scheduled synchronization.
- Frequency: hourly, every six hours, daily, or weekly.
- Preferred time.
- Timezone.
- Selected connected account.
- Selected groups and goals.
- Last run status.
- Recent execution history.
- Error messages.
- Retry action.
- Manual "Sync Now" button.

For the prototype, simulate synchronization with a mock service and a visible run history. Do not claim that an actual background cron job is running.

Design the backend contract so a real job scheduler can execute the same operation later.

## 10. Notifications and Activity

Implement a functional notification center with notifications for:

- New imported transaction candidates.
- Approved or rejected transactions.
- Upcoming payment due dates.
- Overdue tasks.
- Group invitations.
- Goal milestones.
- Member progress updates.
- Synchronization failures.

Include unread indicators, mark-as-read functionality, and notification preferences.

The Activity page should provide a chronological feed showing who did what, which group or goal was affected, and when it happened.

Support filtering by group, goal, activity type, and date.

## 11. Authentication Mode Toggle

Create a configurable authentication mode for development and testing.

The modes are:

- Disabled: Demo mode without login.
- Optional: Allow guest access to limited demo data.
- Required: Require authentication.

For the initial prototype, default to demo mode so the application can be explored immediately without account creation.

Add sign-up, login, logout, and account screens if supported by the implementation environment, or build the UI with clearly documented demo behavior.

Keep this setting separate from Google OAuth, which authorizes access to Gmail.

Do not treat a frontend toggle as real production security. A deployed backend must enforce authentication and permissions independently.

## 12. Settings Page

Organize settings into sections:

### General

- Language.
- Timezone.
- Default currency, initially PHP (₱).
- Date format.
- Theme preference.

### Account

- Profile.
- Email.
- Account preferences.
- Authentication mode for the demo.

### Groups and Goals

- Default group.
- Goal templates.
- Reminder preferences.
- Member permissions.

### Integrations

- Gmail connections.
- Import rules.
- Synchronization frequency.
- Import history.

### Notifications

- Payment reminders.
- Goal updates.
- Email notification preferences.

### Privacy and Security

- Connected account management.
- Access revocation UI.
- Data export.
- Data deletion controls.
- Audit history.

## 13. Technical Requirements

Use the following stack if supported by the current environment:

- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui or a similarly consistent component system.
- Lucide icons.
- Recharts or another suitable charting library.
- React Router if a routing library is needed.

If the environment requires a different stack, use its native conventions while preserving the same architecture and behavior.

Separate the app into reusable components, pages, domain models, services, and utilities.

Recommended conceptual modules:

- GroupsService.
- GoalsService.
- TransactionsService.
- GmailImportService.
- MatchingRulesService.
- AutomationService.
- NotificationsService.
- ThemeService.

For the frontend prototype:

- Use localStorage or another appropriate local persistence mechanism.
- Seed realistic fictional demo data.
- Ensure that the demo can be refreshed without losing saved prototype changes.
- Include a reset-demo-data action.
- Keep calculations in reusable, testable functions.
- Use strict TypeScript types where applicable.
- Add form validation and useful error messages.
- Keep UI state synchronized with stored data.

For a production implementation, use a relational database such as PostgreSQL and a backend API. Design ownership, membership, and access-control relationships clearly.

Use fixed-precision monetary values or integer minor units for calculations rather than floating-point amounts.

## 14. Core Data Model

Design the system around these entities:

- User
- Group
- GroupMember
- Goal
- GoalMember
- ProgressRecord
- FinancialTransaction
- LoanSchedule
- Milestone
- IntegrationConnection
- MatchingRule
- ImportCandidate
- Notification
- AuditLog

Goals should support type-specific configuration. Financial transactions should remain distinct from general progress records.

Each financial transaction should include, as appropriate:

- Unique ID.
- Group ID.
- Goal ID.
- Member ID.
- Amount and currency.
- Transaction type.
- Transaction date.
- Reference number.
- Source.
- Status.
- Notes.
- Created and updated timestamps.

Imported email messages and candidates must have identifiers that support reliable deduplication.

Do not assume that one person equals one bank account or that a transfer always belongs to the person whose name appears in the email.

## 15. Functional Requirements

The following actions must work in the prototype:

- Create, edit, view, and archive groups.
- Add and remove demo group members.
- Create and edit goals.
- Switch between groups and goal dashboards.
- Expand and collapse groups and member rows.
- Add, edit, and filter financial records.
- Confirm or reject imported transaction candidates.
- Detect duplicate demo references or message identifiers.
- Update financial summary cards and charts after changes.
- Change the theme and retain the preference.
- Create and read notifications.
- Change synchronization settings.
- Run a simulated synchronization.
- View simulated synchronization logs.
- Persist data across page reloads.
- Export available financial records to CSV.
- Reset sample data.

Every button should perform its expected action or clearly indicate that the feature is a planned integration. Do not include dead buttons or misleading connection states.

## 16. Initial Demo Data

Initialize the prototype with:

- A group named Family.
- Three sample members: Bernz, Babylyn, and Billy.
- A goal named Car Credit.
- An illustrative 60-installment loan.
- Sample member contributions.
- Sample loan payments and expenses.
- A few upcoming due dates.
- Several fictional bank notification emails.
- Two pending import candidates, including at least one ambiguous match.
- A duplicate candidate for testing deduplication.
- A second goal called Emergency Fund.
- A separate group or demo goal for a non-financial use case, such as a 30-Day Fitness Challenge.

Make all sample data internally consistent. Clearly label simulated records and use fictional information only.

## 17. Delivery Expectations

Build the actual website, not just a specification.

Start with the full application shell and the Car Credit dashboard, but implement the supporting navigation and core interactions so users can explore the product.

Prioritize a polished first impression, intuitive navigation, accurate financial calculations, reusable architecture, and responsive design.

Before finishing:

- Check for broken imports and TypeScript errors.
- Verify all major pages render.
- Test creating and editing groups, goals, and transactions.
- Confirm financial totals recalculate correctly.
- Check duplicate detection and imported transaction review.
- Verify local persistence and theme switching.
- Ensure layouts work on mobile.
- Document which integrations are simulated and what is required for real production use.

If a real backend, OAuth configuration, or external service credentials are unavailable, implement the functional frontend and clear integration boundaries rather than fabricating connectivity.

**Begin implementing the application now. Make reasonable engineering decisions without asking me to approve every small detail.**
