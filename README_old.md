# 🤖 Denim Agent - AI Browser Agent

A powerful AI-driven browser automation agent similar to director.ai by BrowserBase, featuring a beautiful glass-like bluish UI and advanced AI capabilities powered by Google's Gemini API.

## ✨ Features

- **🎨 Glass-like Bluish UI**: Modern, energetic interface with glassmorphism design
- **🧠 AI-Powered Automation**: Uses Gemini API for natural language processing and image analysis
- **📸 Real-time Vision**: Processes screenshots at 2 images per second for continuous monitoring
- **🔧 Browser Control**: Full Puppeteer integration for comprehensive web automation
- **📁 Context Upload**: Support for uploading files (PDF, JSON, CSV, TXT) to provide context
- **⚡ Real-time Communication**: WebSocket-based real-time updates and control
- **📝 Script Generation**: Automatically generates Puppeteer scripts from natural language descriptions
- **🔍 Visual Analysis**: AI-powered analysis of web page screenshots
- **📊 Activity Logging**: Comprehensive logging of all automation activities

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Denim_Agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   NODE_ENV=development
   MAX_IMAGE_SIZE=5MB
   IMAGES_PER_SECOND=2
   ```

4. **Start the application**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 🎯 How to Use

### Basic Automation

1. **Enter a Task**: Describe what you want to automate in natural language
   - Example: "Book a flight from SF to Tokyo"
   - Example: "Search for laptops under $1000 on Amazon"
   - Example: "Fill out a contact form with my information"

2. **Optional URL**: Provide a starting URL if needed

3. **Upload Context**: Drag and drop files to provide additional context

4. **Start Automation**: Click "Start Automation" to begin

### Advanced Features

- **Real-time Screenshots**: Monitor the browser in real-time
- **AI Vision Analysis**: Get AI insights about what's happening on the page
- **Script Execution**: Review and execute generated automation scripts
- **Activity Logging**: Track all automation activities

### Keyboard Shortcuts

- `Ctrl/Cmd + Enter`: Start automation (when task input is focused)
- `Ctrl/Cmd + S`: Take screenshot
- `Ctrl/Cmd + E`: Execute generated script

## 🏗️ Architecture

### Frontend
- **HTML5**: Modern semantic structure
- **CSS3**: Glassmorphism design with animations
- **JavaScript**: Real-time WebSocket communication
- **Socket.io**: Real-time bidirectional communication

### Backend
- **Node.js**: Server runtime
- **Express.js**: Web framework
- **Socket.io**: WebSocket server
- **Puppeteer**: Browser automation
- **Gemini AI**: Natural language processing and vision

### AI Integration
- **Gemini 1.5 Flash**: For text processing and script generation
- **Gemini Vision**: For image analysis (2 images/sec)
- **Context Processing**: File upload and analysis

## 📁 Project Structure

```
Denim_Agent/
├── public/
│   ├── index.html          # Main UI
│   ├── styles.css          # Glassmorphism styling
│   └── script.js           # Frontend logic
├── uploads/                # Uploaded context files
├── server.js               # Main server file
├── package.json            # Dependencies
├── .env.example            # Environment template
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API key (required)
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `MAX_IMAGE_SIZE`: Maximum upload file size
- `IMAGES_PER_SECOND`: Image processing rate limit

### Gemini API Setup

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to your `.env` file

## 🎨 UI Features

### Glass Effect
- Backdrop blur and transparency
- Animated gradients and shimmer effects
- Responsive design for all screen sizes

### Interactive Elements
- Hover animations and transitions
- Real-time status indicators
- Drag-and-drop file upload
- Fullscreen browser view

### Color Scheme
- Primary: Various shades of blue (#4096ff)
- Background: Dark gradient with blue tones
- Glass panels: Semi-transparent with blur effects

## 🔍 API Endpoints

### REST API
- `GET /`: Main application
- `POST /api/analyze-text`: Analyze text with AI
- `POST /api/upload-context`: Upload context files

### WebSocket Events
- `startAutomation`: Begin automation task
- `takeScreenshot`: Capture browser screenshot
- `executeScript`: Run generated script
- `screenshot`: Receive screenshot data
- `imageAnalysis`: Receive AI analysis
- `scriptGenerated`: Receive generated script

## 🛠️ Development

### Adding New Features

1. **Frontend**: Modify files in `public/`
2. **Backend**: Update `server.js`
3. **Styling**: Edit `public/styles.css`

### Testing

The application includes comprehensive error handling and logging. Monitor the browser console and server logs for debugging information.

## 📝 License

MIT License - feel free to use this project for your own purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## 🔗 Inspiration

This project is inspired by director.ai by BrowserBase, bringing similar functionality with a unique glass-like UI and Gemini AI integration.

---

**Made with ❤️ and AI**
