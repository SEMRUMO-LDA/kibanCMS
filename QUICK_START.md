# 🚀 Kiban CMS - Quick Start Guide

Get your Kiban CMS up and running in **under 5 minutes**!

## Prerequisites

Before you begin, make sure you have:

- ✅ **Node.js** (>= 18.0.0) - [Download here](https://nodejs.org/)
- ✅ **A Supabase account** - [Sign up free](https://supabase.com/)
- ✅ **A code editor** (VS Code recommended)

---

## 🎯 Method 1: Automated Setup (Recommended)

The easiest way to get started! Our interactive script will guide you through everything.

### Step 1: Clone the Repository

```bash
git clone https://github.com/kiban-agency/kiban-cms.git
cd kiban-cms
```

### Step 2: Run the Setup Script

**Mac/Linux:**
```bash
pnpm setup
```

**Windows:**
```bash
pnpm setup:windows
```

### Step 3: Follow the Prompts

The script will:
1. Check if you have Node.js and pnpm installed (and install pnpm if needed)
2. Ask for your Supabase URL and Anon Key
3. Create your `.env` file automatically
4. Install all dependencies
5. Guide you through database setup

### Step 4: Setup Database

When prompted, go to your **Supabase Dashboard**:

1. Click **SQL Editor** in the sidebar
2. Click **New Query**
3. Copy and paste each migration file (in order):
   - `database/migrations/001_initial_schema.sql`
   - `database/migrations/005_seed_data.sql`
   - `database/migrations/006_onboarding_manifesto.sql`
   - `database/migrations/007_api_keys.sql`
   - `database/migrations/009_webhooks.sql`
4. Click **Run** after pasting each file

### Step 5: Start Development

```bash
pnpm dev
```

**That's it!** 🎉 Visit:
- **Admin UI:** http://localhost:5173
- **API Server:** http://localhost:5000

---

## 🛠️ Method 2: Manual Setup

Prefer to do it yourself? Here's the manual process:

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/)
2. Click **New Project**
3. Fill in project details (name, password, region)
4. Wait for the project to be ready (~2 minutes)

### Step 2: Get Your Credentials

1. Go to **Project Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys")

### Step 3: Setup the Project

```bash
# Clone the repository
git clone https://github.com/kiban-agency/kiban-cms.git
cd kiban-cms

# Install pnpm (if not installed)
npm install -g pnpm

# Install dependencies
pnpm install

# Create environment file
cp .env.example .env
```

### Step 4: Configure Environment

Edit `.env` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 5: Run Database Migrations

In your Supabase dashboard:

1. Go to **SQL Editor**
2. Click **New Query**
3. Copy and paste each migration file from `database/migrations/`:
   - `001_initial_schema.sql` ← Start here
   - `005_seed_data.sql`
   - `006_onboarding_manifesto.sql`
   - `007_api_keys.sql`
   - `009_webhooks.sql`
4. Click **Run** after each file

### Step 6: Start Development

```bash
pnpm dev
```

**Done!** 🎉 Visit:
- **Admin UI:** http://localhost:5173
- **API Server:** http://localhost:5000

---

## 🌐 Setting Up the Example Frontend (Optional)

Want to see how to consume content from Kiban CMS? Try our example frontend!

### Quick Setup

From the root directory:

```bash
# Mac/Linux
pnpm setup:example

# Windows
pnpm setup:example:windows
```

The script will:
1. Create `.env.local` in `apps/example/`
2. Ask for your Kiban CMS URL (default: http://localhost:5176)
3. Ask for your API key (get it from Settings in the Admin UI)
4. Install dependencies

### Start the Example

```bash
pnpm dev:example
```

Visit http://localhost:3000 to see your blog!

---

## 📋 Troubleshooting

### "pnpm: command not found"

Install pnpm globally:
```bash
npm install -g pnpm
```

### "Cannot connect to Supabase"

1. Check that your `.env` file has the correct credentials
2. Verify your Supabase project is active (check dashboard)
3. Make sure you copied the **anon public** key, not the service role key

### "Database errors" or "relation does not exist"

You need to run the database migrations:
1. Go to Supabase Dashboard → SQL Editor
2. Run each migration file from `database/migrations/` in order

### Port already in use

If ports 5173 or 5000 are already taken:

```bash
# Stop the process using the port
lsof -ti:5173 | xargs kill -9
lsof -ti:5000 | xargs kill -9

# Or change the port in package.json
```

### Windows PowerShell execution policy error

Run PowerShell as Administrator and execute:
```powershell
Set-ExecutionPolicy RemoteSigned
```

---

## 🎓 Next Steps

Now that you're set up, here's what to explore:

1. **📖 Read the Architecture Guide** - [ARCHITECTURE.md](ARCHITECTURE.md)
2. **🔧 Customize Your Schema** - See the manifest examples in the Admin UI
3. **📝 Create Your First Content** - Go to http://localhost:5173
4. **🌐 Build Your Frontend** - Check [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)
5. **🚀 Deploy to Production** - Follow the deployment guide (coming soon)

---

## 🆘 Need Help?

- **Documentation:** Check the `/docs` folder
- **Issues:** Open an issue on GitHub
- **Email:** dev@kiban.pt

---

## 📝 Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all development servers |
| `pnpm dev:admin` | Start only the Admin UI |
| `pnpm dev:api` | Start only the API Server |
| `pnpm dev:example` | Start the example frontend |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format code with Prettier |
| `pnpm clean` | Clean all node_modules |

---

**Happy coding!** 🎉

Built with ❤️ by [Kiban Agency](https://kiban.pt)
