# n8n DFY Autopilot 🤖

**Fully automated n8n workflow generation, testing, and delivery system with YouTube content creation**

## 📋 Master Index

### **Current Implementation Status**
- ✅ **Foundation Complete** - Core API server, database, Redis, queues
- ✅ **Customer API** - Request processing and pricing estimation
- 🔄 **In Progress** - Claude workflow generation engine
- 📋 **Pending** - Playwright testing automation, content creation, video publishing

### **Project Structure**
```
src/
├── server.js                    # ✅ Main Express.js application server
├── config/
│   ├── database.js             # ✅ PostgreSQL connection & schemas
│   ├── redis.js                # ✅ Redis caching & pub/sub
│   └── queues.js               # ✅ Bull queue system (6 job types)
├── routes/
│   ├── customer.js             # ✅ Customer request CRUD API
│   ├── workflow.js             # 📋 Workflow management (pending)
│   ├── content.js              # 📋 Content creation routes (pending)
│   └── analytics.js            # 📋 Analytics endpoints (pending)
├── services/
│   ├── workflowGenerator.js    # 🔄 Claude-powered generation (in progress)
│   ├── workflowTester.js       # 📋 Playwright testing (placeholder)
│   ├── contentCreator.js       # 📋 Video creation (placeholder)
│   ├── videoPublisher.js       # 📋 YouTube publishing (placeholder)
│   ├── emailService.js         # 📋 Email delivery (placeholder)
│   └── analytics.js            # 📋 Event tracking (placeholder)
├── utils/
│   └── logger.js               # ✅ Winston logging system
└── middleware/
    └── auth.js                 # ✅ API authentication
```

### **Tech Stack Implementation**
- ✅ **Backend**: Express.js with comprehensive middleware
- ✅ **Database**: PostgreSQL with connection pooling (5 tables)
- ✅ **Caching**: Redis with helper functions
- ✅ **Queues**: Bull system for background jobs
- ✅ **Dependencies**: 931 npm packages installed
- 📋 **AI Integration**: Claude SDK (pending implementation)
- 📋 **Testing**: Playwright automation (pending)
- 📋 **Video**: FFmpeg processing (pending)

### **API Endpoints Available**
```
✅ POST   /api/customers/requests     - Create customer request
✅ GET    /api/customers/requests     - List requests with pagination
✅ GET    /api/customers/requests/:id - Get specific request
✅ PUT    /api/customers/requests/:id - Update request
✅ DELETE /api/customers/requests/:id - Delete request
✅ GET    /health                     - Health check endpoint
📋 POST   /api/workflows/generate     - Generate n8n workflow (pending)
📋 POST   /api/workflows/test         - Test workflow (pending)
📋 POST   /api/content/create         - Create video content (pending)
📋 POST   /api/content/publish        - Publish to YouTube (pending)
```

## 🎯 Project Overview

n8n DFY Autopilot is a complete automation business that takes customer requests and autonomously:
- Generates custom n8n workflows using AI
- Tests and validates workflows automatically
- Creates professional video tutorials
- Delivers workflows and publishes content
- Handles customer fulfillment end-to-end

## 🚀 Business Model

**Revenue Streams:**
- Per-node pricing for custom n8n workflows
- YouTube ad revenue from automated tutorial content
- Upsell opportunities (maintenance, training, consulting)

**Target Market:**
- Small businesses needing automation
- Entrepreneurs without technical expertise
- Companies looking to streamline operations

## 🏗️ System Architecture

### Phase 1: Customer Request Processing
- Web form captures automation requirements
- AI analyzes and estimates complexity/pricing
- Automated quote generation and approval

### Phase 2: Workflow Generation
- Claude Desktop (Opus) generates n8n workflow JSON
- MCP integration saves workflows to GitHub
- Version control and quality tracking

### Phase 3: Testing & Validation
- Automated import into n8n test environment
- Comprehensive testing with sample data
- Iteration loop until workflows pass validation

### Phase 4: Content Creation
- Script generation for video tutorials
- Text-to-speech audio production
- Screen recording of workflow demonstrations
- Automated video assembly and editing

### Phase 5: Delivery & Publishing
- YouTube upload with SEO optimization
- Customer delivery via email
- Analytics and feedback collection

## 🛠️ Technology Stack

**AI & Automation:**
- Claude Desktop (Opus) for workflow generation
- Claude Computer Use for UI automation
- Claude Code for file operations
- n8n for orchestration

**Development Tools:**
- Playwright for browser automation
- MCP for file management
- GitHub for version control
- FFmpeg for video processing

**Services:**
- ElevenLabs for text-to-speech
- YouTube API for publishing
- Email service for delivery
- Payment processing integration

## 📋 Quick Start

1. **Clone Repository**
   ```bash
   git clone https://github.com/1genadam/n8n_dfy_autopilot.git
   cd n8n_dfy_autopilot
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Configure API keys and settings
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Configure Services**
   - Set up Claude API access
   - Configure n8n instance
   - Set up YouTube API credentials
   - Configure TTS service

5. **Run Development Environment**
   ```bash
   npm run dev
   ```

## 📚 Documentation

- **[Roadmap](ROADMAP.md)** - Development phases and milestones
- **[Technical Guide](TECHNICAL_GUIDE.md)** - Detailed implementation guide
- **[API Documentation](docs/api.md)** - API endpoints and usage
- **[Deployment Guide](docs/deployment.md)** - Production setup instructions

## 🎥 Demo

[Link to demo video showing the complete automation pipeline]

## 📤 GitHub Repository & Contributing

### **Repository Information**
- **GitHub**: https://github.com/1genadam/n8n_dfy_autopilot.git
- **Main Branch**: `master` (Note: Uses master, not main)
- **License**: Private business project - All rights reserved
- **Current Authentication**: Personal Access Token (configured in remote URL)

### **🔄 Creating Pull Requests**

#### **Method 1: Using Personal Access Token & GitHub API (Recommended)**
> **✅ This project is pre-configured with Personal Access Token authentication**
> 
> **Why This Method is Recommended:**
> - ✅ **Already configured** - No additional setup required
> - ✅ **Programmatic approach** - Works well with automation
> - ✅ **No extra dependencies** - Uses curl (built into most systems)
> - ✅ **Consistent with project setup** - Matches existing authentication
```bash
# Create and push feature branch
git checkout -b feature/your-feature-name
git add .
git commit -m "Your commit message"
git push -u origin feature/your-feature-name

# Create pull request using GitHub API
curl -X POST \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/1genadam/n8n_dfy_autopilot/pulls \
  -d '{
    "title": "Your PR Title",
    "head": "feature/your-feature-name",
    "base": "master",
    "body": "Description of your changes"
  }'
```

#### **Method 2: Using GitHub Web Interface**
```bash
# Push your feature branch
git checkout -b feature/your-feature-name
git add .
git commit -m "Your commit message"
git push -u origin feature/your-feature-name

# Then visit: https://github.com/1genadam/n8n_dfy_autopilot/pulls
# Click "New pull request" and select your branch
```

#### **Method 3: Using GitHub CLI (Optional - Not Pre-configured)**
```bash
# Only if you want to install GitHub CLI
brew install gh

# Create feature branch and push changes
git checkout -b feature/your-feature-name
git add .
git commit -m "Your commit message"
git push -u origin feature/your-feature-name

# Create pull request
gh pr create --title "Your PR Title" --body "Description of changes"
```

### **✅ Quick Push (Direct to Master - Use Sparingly)**
```bash
# Only for urgent hotfixes - prefer pull requests for review
git add .
git commit -m "Your commit message"
git push origin master
```

### **Easy GitHub Commit Instructions**

#### **Step 1: Check Status**
```bash
# View current changes
git status

# See what files have been modified
git diff --name-only
```

#### **Step 2: Stage Changes**
```bash
# Add all changes
git add .

# Or add specific files
git add src/workflow.js components/ui.js
```

#### **Step 3: Commit with Descriptive Message**
```bash
# Create commit with detailed message
git commit -m "Brief description of changes

- Detailed bullet point 1
- Detailed bullet point 2  
- Detailed bullet point 3

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### **Step 4: Push to GitHub**
```bash
# Push to the n8n_dfy_autopilot repository
git push origin master

# Alternative: Push to specific remote if configured
git push n8n-autopilot master
```

#### **🔐 Authentication Methods**

**✅ CURRENT METHOD: Personal Access Token (Working)**
```bash
# This project is currently configured to use Personal Access Token
# Token is already configured in the remote URL
# Simply use: git push origin master
```

**Option 1: SSH Key (Alternative)**
```bash
# 1. Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "your-email@example.com"

# 2. Add key to SSH agent
ssh-add ~/.ssh/id_ed25519
# (Enter your passphrase when prompted)

# 3. Copy public key to clipboard
cat ~/.ssh/id_ed25519.pub
# Add this key to GitHub → Settings → SSH and GPG keys

# 4. Test connection
ssh -T git@github.com

# 5. Ensure remote uses SSH
git remote set-url origin git@github.com:1genadam/n8n_dfy_autopilot.git
```

**Option 2: Personal Access Token Setup (For New Users)**
```bash
# 1. Create token at GitHub → Settings → Developer settings → Personal access tokens
# 2. Select 'repo' permissions
# 3. Use token in remote URL
git remote set-url origin https://YOUR_TOKEN@github.com/1genadam/n8n_dfy_autopilot.git

# 4. Push normally
git push origin master
```

**🚨 Troubleshooting Authentication**
```bash
# SSH Permission denied?
# - Check if key is added: ssh-add -l
# - Verify key in GitHub: cat ~/.ssh/id_ed25519.pub
# - Test connection: ssh -T git@github.com

# HTTPS asking for username/password?
# - Use personal access token instead of password
# - Update remote URL with token (see Option 2 above)
```

#### **Example Complete Workflow**
```bash
# 1. Check what changed
git status

# 2. Add all changes
git add .

# 3. Commit with message
git commit -m "Enhanced workflow generation system

- Added AI-powered n8n workflow templates
- Implemented automated testing framework  
- Updated video generation pipeline
- Fixed customer delivery system

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 4. Push to GitHub
git push origin master
```

#### **Git Remote Configuration**
If you need to set up the remote:
```bash
# Check current remotes
git remote -v

# Add origin remote (if not exists)
git remote add origin git@github.com:1genadam/n8n_dfy_autopilot.git

# Set as default upstream
git branch --set-upstream-to=origin/master master
```

### **Contributing Guidelines**
This is a personal business project, but feedback and suggestions are welcome through:
- **Issues**: Bug reports and feature requests
- **Pull Requests**: Code improvements and enhancements
- **Discussions**: Questions and general feedback

## 📞 Contact

For business inquiries or technical questions:
- Email: [your-email]
- LinkedIn: [your-linkedin]
- Twitter: [your-twitter]

---

**Built with ❤️ and AI automation**