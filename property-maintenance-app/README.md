# PSB Maintenance Hub

A premium property maintenance management system with an AI-powered WhatsApp bot for tenant issue reporting, automated triage, and a management dashboard for your team.

Built for **PSB Properties (FFR Group)** / **52 Old Elvet** property management in Durham.

## Features

### WhatsApp Bot (Tenant-Facing)
- Automatic tenant onboarding (name, property, flat number)
- Natural language issue reporting via WhatsApp
- Photo upload with AI vision analysis (identifies issues from images)
- AI-powered diagnosis and triage (powered by Claude or GPT, your choice)
- Step-by-step fix guidance with YouTube/web resource suggestions
- Appliance model number lookups for specific fixes
- Safety guardrails (never suggests dangerous DIY, escalates emergencies)
- Automatic escalation after configurable number of bot attempts
- Reference number tracking for every issue

### Management Dashboard (Staff-Facing)
- Premium dark-themed interface with intuitive navigation
- Real-time dashboard with stats, category breakdowns, property overview
- Full issue list with filters (status, priority, property, search)
- Detailed issue view with complete conversation logs and photos
- Manual WhatsApp response capability from the dashboard
- Inline status and priority management
- Activity log for every issue
- Properties and tenants management
- Settings panel with LLM provider toggle (Claude/GPT)
- API key management (change provider without redeploying)
- Team member management with role-based access
- Configurable escalation threshold and bot messages

### Automated Escalation
- After configurable attempts (default: 3), issues escalate automatically
- Full HTML email sent to admin@52oldelvet.com with:
  - Complete conversation log
  - All tenant photos attached
  - AI diagnosis summary
  - Tenant and property details
  - Priority badge

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express |
| Frontend | React 18, Vite, React Router |
| Database | SQLite (via better-sqlite3) - zero config |
| AI/LLM | Anthropic Claude API + OpenAI GPT API (switchable) |
| WhatsApp | Meta WhatsApp Business Cloud API |
| Email | Nodemailer (SMTP) |
| Auth | JWT + bcrypt |

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# 1. Install server dependencies
npm install

# 2. Install client dependencies
cd client && npm install && cd ..

# 3. Run setup (creates database, seeds properties, creates admin user)
node server/setup.js

# 4. Edit .env with your API keys
#    (see .env.example for all options)

# 5. Start both server and client
npm run dev
```

The dashboard will be available at **http://localhost:5173**

### Default Login
- Email: `admin@52oldelvet.com`
- Password: `changeme123`

**Change this immediately after first login.**

## Configuration

### Environment Variables (.env)

```
PORT=3001                          # Server port
JWT_SECRET=your-secret-key         # JWT signing secret

# WhatsApp Business Cloud API
WHATSAPP_PHONE_NUMBER_ID=          # From Meta Business Manager
WHATSAPP_ACCESS_TOKEN=             # Permanent access token
WHATSAPP_VERIFY_TOKEN=             # Your custom webhook verify token
WHATSAPP_BUSINESS_ACCOUNT_ID=      # Your business account ID

# LLM (set at least one)
LLM_PROVIDER=anthropic             # 'anthropic' or 'openai'
ANTHROPIC_API_KEY=sk-ant-...       # Claude API key
OPENAI_API_KEY=sk-...              # OpenAI API key

# Email (for escalation notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password        # Use Gmail App Password
ESCALATION_EMAIL=admin@52oldelvet.com

# Admin (used on first setup only)
ADMIN_EMAIL=admin@52oldelvet.com
ADMIN_PASSWORD=changeme123
```

### WhatsApp Business API Setup

1. Create a Meta Business account at business.facebook.com
2. Set up WhatsApp Business API in Meta Business Manager
3. Create a System User and generate a permanent access token
4. Set your webhook URL to: `https://your-domain.com/api/webhook/whatsapp`
5. Set the verify token to match your `WHATSAPP_VERIFY_TOKEN` env var
6. Subscribe to the `messages` webhook field

### Switching LLM Provider

You can switch between Claude and GPT at any time:
1. Go to Settings > AI Configuration in the dashboard
2. Toggle between Anthropic and OpenAI
3. Enter/update the relevant API key
4. Click Save Changes

The change takes effect immediately for all new conversations.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Staff login |
| GET | `/api/auth/me` | Current user |
| GET | `/api/issues` | List issues (with filters) |
| GET | `/api/issues/stats` | Dashboard statistics |
| GET | `/api/issues/:id` | Issue detail with messages |
| PUT | `/api/issues/:id` | Update issue status/priority |
| POST | `/api/issues/:id/respond` | Send manual staff response |
| GET | `/api/properties` | List properties |
| POST | `/api/properties` | Add property |
| GET | `/api/tenants` | List tenants |
| GET | `/api/settings` | Get settings (admin) |
| PUT | `/api/settings` | Update settings (admin) |
| GET | `/api/webhook/whatsapp` | WhatsApp verification |
| POST | `/api/webhook/whatsapp` | Incoming WhatsApp messages |

## Pre-Seeded Properties

The following Durham properties are seeded on first setup:
- 52 Old Elvet (8 units)
- 53 Old Elvet (6 units)
- Claypath House (10 units)
- Viaduct House (8 units)
- 24 Hallgarth Street (4 units)
- Albert Street (6 units)

Add more via the Properties page in the dashboard.

## Project Structure

```
property-maintenance-app/
  server/
    index.js              # Express server entry point
    database.js           # SQLite database setup and schema
    setup.js              # First-run setup script
    middleware/
      auth.js             # JWT authentication
    routes/
      auth.js             # Login, staff management
      issues.js           # Issue CRUD, stats, manual response
      api.js              # Properties, tenants, settings, webhook
    services/
      llm.js              # AI service (Claude + OpenAI)
      whatsapp.js         # WhatsApp message processing
      email.js            # Escalation email service
    data/                 # SQLite database file
    uploads/              # Uploaded photos
  client/
    src/
      App.jsx             # Root with routing and auth
      pages/
        Login.jsx         # Login page
        Dashboard.jsx     # Stats overview
        Issues.jsx        # Issue list with filters
        IssueDetail.jsx   # Issue detail with chat
        Properties.jsx    # Property management
        Tenants.jsx       # Tenant directory
        Settings.jsx      # LLM, bot, email, team config
      components/
        Layout.jsx        # Sidebar navigation layout
      utils/
        api.js            # API client
      index.css           # Global premium styles
```

## Production Deployment

```bash
# Build the client
npm run build

# Start server (serves both API and built client)
node server/index.js
```

For production, consider:
- Using a process manager (PM2) or Docker
- Putting Nginx in front for SSL termination
- Using a proper domain with HTTPS (required for WhatsApp webhooks)
- Setting strong JWT_SECRET and ADMIN_PASSWORD values
- Regular database backups (the SQLite file in server/data/)
