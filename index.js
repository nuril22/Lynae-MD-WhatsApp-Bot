// Suppress punycode deprecation warning
process.removeAllListeners('warning')
process.on('warning', (warning) => {
    // Suppress punycode deprecation warnings
    if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
        return // Ignore punycode deprecation warnings
    }
    // Show other warnings
    console.warn(warning.name, warning.message)
})

// Import Modules (ESM)
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@rexxhayanasi/elaina-baileys'
import pino from 'pino'
import chalk from 'chalk'
import lynae, { config, requestPairing } from './lynae.js'

// pairing method
const usePairingCode = true

// Store socket instance
let sock = null
let messageHandlerRegistered = false
let globalMessageHandler = null

// WhatsApp Connection
async function connectToWhatsApp() {
    // Reset message handler flag on reconnect
    messageHandlerRegistered = false
    globalMessageHandler = null
    
    // Delete old session if exists and failed
    const { state, saveCreds } = await useMultiFileAuthState("./LynaeSession")

    // Get latest version
    let version
    try {
        const baileysVersion = await fetchLatestBaileysVersion()
        version = baileysVersion.version
        console.log(chalk.cyan(`Using WA version: ${version.join('.')}`))
    } catch {
        version = [2, 3000, 1015901307]
    }

    // Create WhatsApp Connection
    sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        getMessage: async (key) => {
            return { conversation: '' }
        },
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 10000, // Send keepalive every 10s
    })

    // Store connection state
    store.bind(sock.ev)

    // Handle pairing code menggunakan fungsi dari lynae.js
    if (usePairingCode) {
        const pairingSuccess = await requestPairing(sock)
        if (!pairingSuccess) {
            process.exit(1)
        }
    }

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds)

    // Connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const reason = lastDisconnect?.error?.output?.payload?.message
            
            // Handle different disconnect reasons
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(chalk.red('❌ Device logged out. Please delete LynaeSession folder and restart.'))
                process.exit(0)
            } else if (statusCode === 401) {
                console.log(chalk.red('❌ Unauthorized. Session expired. Delete LynaeSession folder.'))
                process.exit(0)
            } else if (statusCode === 515) {
                // Stream error - common during pairing/initial connection
                console.log(chalk.yellow('⚠️  Stream error (code 515) - This is normal during initial connection'))
                console.log(chalk.cyan('♻️  Auto-reconnecting in 3 seconds...'))
                setTimeout(() => connectToWhatsApp(), 3000)
            } else if (statusCode === DisconnectReason.connectionClosed) {
                console.log(chalk.yellow('⚠️  Connection closed by server'))
                console.log(chalk.cyan('♻️  Reconnecting in 5 seconds...'))
                setTimeout(() => connectToWhatsApp(), 5000)
            } else if (statusCode === DisconnectReason.connectionLost) {
                console.log(chalk.yellow('⚠️  Connection lost'))
                console.log(chalk.cyan('♻️  Reconnecting in 5 seconds...'))
                setTimeout(() => connectToWhatsApp(), 5000)
            } else if (statusCode === DisconnectReason.timedOut) {
                console.log(chalk.yellow('⚠️  Connection timeout'))
                console.log(chalk.cyan('♻️  Reconnecting in 5 seconds...'))
                setTimeout(() => connectToWhatsApp(), 5000)
            } else {
                // Generic reconnect for other errors
                console.log(chalk.red(`⚠️  Connection closed (${statusCode}): ${reason || 'Unknown reason'}`))
                console.log(chalk.cyan('♻️  Reconnecting in 5 seconds...'))
                setTimeout(() => connectToWhatsApp(), 5000)
            }
        } else if (connection === 'open') {
            console.log(chalk.green('\n✅ Successfully connected to WhatsApp!'))
            console.log(chalk.cyan(`📱 Logged in as: ${sock.user?.id}`))
            console.log(chalk.green('🤖 Bot is ready to receive messages!\n'))

            // Update bot bio/status dari config
            try {
                if (config?.bio && typeof sock.updateProfileStatus === 'function') {
                    await sock.updateProfileStatus(config.bio)
                    console.log(chalk.green('📝 Bot bio updated from config.'))
                }
            } catch (e) {
                console.log(chalk.yellow('⚠️ Failed to update bot bio:'), e.message)
            }

            // Register message handler when connection is open
            registerMessageHandler()
        } else if (connection === 'connecting') {
            console.log(chalk.yellow('⌛ Connecting to WhatsApp...'))
        }
    })

    // Register message handler function (only once)
    function registerMessageHandler() {
        if (!messageHandlerRegistered && sock) {
            // Remove old handler if exists (prevent duplicates)
            if (globalMessageHandler) {
                try {
                    sock.ev.off('messages.upsert', globalMessageHandler)
                } catch (e) {
                    // Ignore if handler doesn't exist
                }
            }
            
            // Create new handler
            globalMessageHandler = async (m) => {
                try {
                    // Only process messages.upsert, ignore messages.update
                    if (m && (m.type === 'notify' || m.type === 'append')) {
                        await lynae(sock, m)
                    }
                } catch (error) {
                    // Ignore decryption errors (Bad MAC) - these are usually non-fatal
                    if (error.message && error.message.includes('Bad MAC')) {
                        // Silently ignore - this is a known issue with session sync
                        return
                    }
                    console.error(chalk.red('Error processing message:'), error.message)
                }
            }
            
            // Register handler ONLY for messages.upsert
            sock.ev.on('messages.upsert', globalMessageHandler)
            messageHandlerRegistered = true
            console.log(chalk.green('✓ Message handler registered (messages.upsert only)'))
        }
    }
    
    // Register handler when connection is open (not immediately to prevent duplicate)
    // The handler will be registered in connection.update event when connection === 'open'
    // No need for additional connection.update listener - already handled above

    return sock
}

// Simple store
const store = {
    bind: (ev) => {
        ev.on('chats.set', () => {
            console.log(chalk.gray('📚 Chats loaded'))
        })
        ev.on('contacts.set', () => {
            console.log(chalk.gray('👥 Contacts loaded'))
        })
    }
}

// Start
console.log(chalk.cyan('\n' + '═'.repeat(60)))
console.log(chalk.cyan.bold('        🤖 WhatsApp Bot - Pairing Code Method'))
console.log(chalk.cyan('═'.repeat(60) + '\n'))

// Global error handlers
process.on('unhandledRejection', (err) => {
    // Suppress Bad MAC errors (non-fatal decryption errors)
    if (err && err.message && (err.message.includes('Bad MAC') || err.message.includes('Failed to decrypt'))) {
        // Silently ignore - these are common and non-fatal
        return
    }
    console.log(chalk.red('💥 Unhandled Rejection:'), err)
})

process.on('uncaughtException', (err) => {
    // Suppress Bad MAC errors (non-fatal decryption errors)
    if (err && err.message && (err.message.includes('Bad MAC') || err.message.includes('Failed to decrypt'))) {
        // Silently ignore - these are common and non-fatal
        return
    }
    console.log(chalk.red('💥 Uncaught Exception:'), err)
})

// Suppress console errors from libsignal (Bad MAC errors)
const originalError = console.error
console.error = (...args) => {
    const message = args.join(' ')
    // Filter out Bad MAC and decryption errors
    if (message.includes('Bad MAC') || 
        message.includes('Failed to decrypt') || 
        message.includes('Session error')) {
        return // Don't log these errors
    }
    originalError.apply(console, args)
}

connectToWhatsApp().catch(err => {
    console.error(chalk.red('\n💥 Fatal Error:'), err)
    process.exit(1)
})