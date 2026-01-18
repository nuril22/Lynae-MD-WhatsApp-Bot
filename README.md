# 🤖 Lynae-MD

<div align="center">

![Lynae-MD](media/Lynae-MD.png)

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Node.js-16+-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-Library-blue?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)

**Lynae-MD** is a modular, lightweight, and powerful WhatsApp Bot built with [Baileys](https://github.com/WhiskeySockets/Baileys). It features a robust plugin system, hot-reloading, and easy configuration, making it the perfect base for your WhatsApp automation projects.

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Contributing](#-contributing)

</div>

---

## ✨ Features

- 🧩 **Modular Plugin System**: Add or remove commands easily by dropping files into the `plugins` folder.
- 🔄 **Hot Reloading**: Edit plugins and see changes instantly without restarting the bot.
- 🛡️ **Anti-Spam & Security**: Built-in duplicate message prevention and session management.
- 📱 **Pairing Code Support**: Log in easily using a pairing code (no QR scan required).
- 🎨 **Rich Media Support**: Send images, videos, stickers, and audio seamlessly.
- 📊 **System Monitoring**: Check RAM, CPU, and Uptime with the `ping` command.
- 🛠️ **Developer Friendly**: Clean code structure, detailed logging, and easy configuration.

---

## 🛠️ Requirements

Before you begin, ensure you have the following installed:

- Node.js (Version 16.x or higher)
- Git
- FFmpeg (Required for sticker and media processing)

---

## 🚀 Installation

1. **Clone the Repository**
```bash
git clone https://github.com/nuril22/lynae-md.git
cd lynae-md
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configuration

Edit `config.js` to configure your bot:

```javascript
export const config = {
    botName: 'Lynae-MD',
    
    // Bot Number (optional - leave empty to input manually when bot starts)
    botNumber: '', // Example: '+6281234567890' or leave empty
    
    // Bot Owner
    owner: [
        '6281234567890@s.whatsapp.net', // Replace with your number
    ],
    
    // Bot Bio
    bio: '🤖 Lynae-MD Bot\n\nA powerful WhatsApp bot built with Baileys\n\nType .help for commands'
}
```

**Note:** If `botNumber` is empty, the bot will ask for your phone number when it starts (first time pairing only).

---

## 💻 Usage

### Production Mode

```bash
npm start
```

### Development Mode (with auto-restart)

```bash
npm run dev
```

**Note:** 
- Development mode will auto-restart when files in the `plugins/` folder or other `.js` files are changed (except `index.js`).
- **Hot Reload**: Plugins are automatically reloaded when you save changes to plugin files - no restart needed! The bot uses a file watcher system that detects changes and reloads plugins on-the-fly.

### First Time Setup

1. **Configure Bot Number (Optional):**
   - Open `config.js`
   - Set `botNumber` to your WhatsApp number (e.g., `'+6281234567890'`)
   - Or leave it empty to input manually when bot starts

2. **Run the bot:**
   ```bash
   npm start
   # or
   npm run dev
   ```

3. **Pairing Process:**
   - If `botNumber` is set in config, the bot will use it automatically
   - If `botNumber` is empty, the bot will ask for your WhatsApp number
   - The bot will provide a pairing code
   - Open WhatsApp on your phone:
     - Tap Menu (⋮) or Settings ⚙️
     - Tap "Linked Devices"
     - Tap "Link a Device"
     - Tap "Link with phone number instead"
     - Enter the pairing code provided by the bot
   - Once successful, the bot will connect and be ready to use!

**Note:** After first pairing, the session is saved in `LynaeSession/` folder. You won't need to pair again unless you delete this folder.

---

## 📁 Project Structure

```
lynae-md/
├── index.js              # Main entry point (WhatsApp connection)
├── handler.js            # Message handler (command processing logic)
├── lynae.js              # Handler wrapper & pairing function
├── config.js             # Bot configuration (bot number, owner, etc.)
├── package.json          # Dependencies & scripts
├── nodemon.json          # Nodemon configuration
├── plugins/              # Folder for all commands
│   ├── index.js          # Plugin loader
│   ├── help.js           # Help command
│   ├── ping.js           # Ping command (system info)
│   └── getpp.js          # Get profile picture command
└── LynaeSession/         # Session folder (auto-generated)
```

---

## ➕ Adding New Commands

### Steps:

1. **Create a new file** in the `plugins/` folder with a name matching your command (example: `hello.js`)

2. **Use the following template:**

```javascript
const handler = async (m, { lynae, usedPrefix, plugins }) => {
    // Your command code here
    
    // Get chat ID (group or private chat where command was sent)
    const chatId = m.chat || m.sender
    
    // Example: Send a reply message (automatically sent to chat where command was executed)
    await lynae.sendMessage(chatId, { 
        text: "Hello! I'm Lynae Bot 🤖" 
    })
}

// Handler configuration
handler.help = ['hello', 'hi', 'halo']  // Command names (can be multiple)
handler.tags = ['main']                 // Command category
handler.command = /^(hello|hi|halo)$/i // Regex pattern to match command

export default handler
```

3. **The plugin will be automatically loaded** - No restart needed! The bot uses hot-reload system that automatically detects and loads new/updated plugins.

4. **Test the command** by sending `hello`, `/hello`, `.hello`, or `#hello`

**Note:** If you're using `npm run dev`, the bot will auto-restart on file changes. However, with the hot-reload system, plugins are automatically reloaded without restarting the entire bot.

### Handler Properties Explanation:

- **`handler.help`** - Array containing command names (will appear in help menu)
- **`handler.tags`** - Array containing command categories (for grouping in help)
- **`handler.command`** - Regex pattern to match command (case insensitive with `i` flag)

### Handler Parameters:

- **`m`** - Object containing message information:
  - `m.sender` - Sender JID (user who sent the command)
  - `m.chat` - Chat JID (group or private chat where command was sent)
  - `m.body` - Full message content
  - `m.command` - Command in lowercase
  - `m.text` - Command text (case sensitive)
  - `m.key` - Message key object
  - `m.quoted` - Quoted message info (if command is a reply)
  - `m.mentions` - Array of mentioned user JIDs

- **`{ lynae, usedPrefix, plugins }`** - Context object:
  - `lynae` - Socket instance for sending messages (automatically sends to chat where command was executed)
  - `usedPrefix` - Prefix used by user
  - `plugins` - Array of all registered plugins

### Complete Command Example:

```javascript
const handler = async (m, { lynae, usedPrefix }) => {
    // Get arguments after command
    const args = m.text.split(' ').slice(1)
    const name = args[0] || 'User'
    
    // Get chat ID (group or private chat where command was sent)
    const chatId = m.chat || m.sender
    
    // Typing indicator (send to chat where command was executed)
    await lynae.sendPresenceUpdate('composing', chatId)
    await new Promise(resolve => setTimeout(resolve, 2000))
    await lynae.sendPresenceUpdate('available', chatId)
    
    // Send message (automatically sent to chat where command was executed)
    await lynae.sendMessage(chatId, { 
        text: `Hello ${name}! 👋\n\nI'm Lynae Bot, nice to meet you!` 
    })
}

handler.help = ['hello <name>']
handler.tags = ['main']
handler.command = /^hello$/i

export default handler
```

### Tips:

- ✅ Use typing indicator for a more natural experience
- ✅ Validate input if the command requires parameters
- ✅ Handle errors with try-catch if needed
- ✅ Use consistent categories for grouping in help menu
- ✅ Document commands clearly in `handler.help`

---

## 📝 Available Commands

### Main Commands

| Command | Description | Category |
|---------|-------------|----------|
| `help` | Display list of all commands | `main` |
| `menu` | Alias for help | `main` |
| `?` | Alias for help | `main` |

### Info Commands

| Command | Description | Category |
|---------|-------------|----------|
| `ping` | Display system information (RAM, CPU, OS, Uptime) | `info` |
| `p` | Alias for ping | `info` |

### Tools Commands

| Command | Description | Category |
|---------|-------------|----------|
| `getpp` | Get profile picture of yourself, mentioned user, or replied user | `tools` |

**Usage:**
- `.getpp` - Get your own profile picture
- `.getpp @user` - Get profile picture of mentioned user
- Reply a message and type `.getpp` - Get profile picture of the user whose message you replied

**Note:** All commands can use any supported prefix

---

## 🔧 Advanced Configuration

### Changing Prefixes

Edit `handler.js` in this section:

```javascript
const prefixes = ['!', '/', '.', '#']  // Add or remove prefixes here
```

### Changing Session Folder

Edit `index.js` in this section:

```javascript
const { state, saveCreds } = await useMultiFileAuthState("./LynaeSession")
```

### Setting Bot Number

You can set the bot number in two ways:

1. **In `config.js` (Recommended):**
   ```javascript
   botNumber: '+6281234567890' // Set your number here
   ```

2. **Leave empty in config:**
   - The bot will ask for your number when it starts (first time only)
   - Useful if you want to use different numbers without editing config

### Hot Reload System

The bot includes a built-in hot-reload system for plugins:

- **Automatic**: When you save a plugin file, it's automatically reloaded
- **No Restart Required**: Changes take effect immediately
- **File Watcher**: Monitors the `plugins/` directory for changes
- **Console Feedback**: Shows reload status in console

**How it works:**
1. Save your plugin file
2. The file watcher detects the change
3. Plugin is automatically reloaded with cache busting
4. Changes are immediately available

**Note:** For major changes (like adding new dependencies), you may still need to restart the bot.

### Auto Restart Configuration

Edit `nodemon.json` to change auto-restart configuration:

```json
{
  "watch": ["."],
  "ignore": [
    "index.js",
    "node_modules",
    "LynaeSession",
    "*.log",
    ".git"
  ],
  "ext": "js,json"
}
```

**Note:** With hot-reload enabled, nodemon restart is mainly needed for changes to core files (`index.js`, `handler.js`, `config.js`). Plugin changes are handled by hot-reload.

---

## 🐛 Troubleshooting

### Bot not responding to commands

1. Make sure the bot is connected (check console for "Connection Opened")
2. Ensure the command uses the correct prefix
3. Check if plugins are loaded (see console on start)
4. Make sure the regex pattern in `handler.command` is correct

### "Connection Closed" Error

- This is normal during first-time pairing
- Wait a few seconds, the bot will auto-reconnect
- If it continues, delete the `LynaeSession` folder and login again

### Command processed twice

- There's already a duplicate prevention system
- If it still happens, check if there are multiple event handlers registered

### Plugin not loading

- Make sure the plugin file uses `export default handler` (ESM syntax)
- Ensure `handler` is a function
- Check console for error messages
- Make sure the file is in the `plugins/` folder
- The plugin should be automatically reloaded when saved (hot-reload)

### Bad MAC Error

- This error is already suppressed and not fatal
- The bot continues to function normally
- This error occurs due to session encryption sync

---

## 📄 License

MIT License - free to use for personal or commercial projects.

---

## 👤 Author

**Nuril Ardhi**

- GitHub: [@nuril22](https://github.com/nuril22)
- Email: fort@vtxgroup.my.id

---

## 🙏 Credits

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [@rexxhayanasi/elaina-baileys](https://github.com/rexxhayanasi/elaina-baileys) - Enhanced Baileys wrapper
- [Chalk](https://github.com/chalk/chalk) - Terminal string styling
- [Nodemon](https://github.com/remy/nodemon) - Auto-restart tool

---

## ⚠️ Disclaimer

This bot is created for educational and personal use purposes. Users are fully responsible for the use of this bot. Please ensure compliance with WhatsApp Terms of Service.

---

## 📞 Support

If you have questions or need help:

1. Open [Issues](https://github.com/nuril22/lynae-md/issues) on GitHub
2. Or contact the author via email

---

<div align="center">

**⭐ If this project helps you, don't forget to give it a star! ⭐**

Made with ❤️ by Nuril Ardhi

</div>
