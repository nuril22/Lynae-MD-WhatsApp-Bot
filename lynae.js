// Import Modules (ESM)
import handler from './handler.js'
import { config } from './config.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Preload media assets (so plugins bisa pakai dari sini)
const media = {}

try {
    const bannerPath = path.join(__dirname, 'media', 'Lynae-MD.png')
    if (fs.existsSync(bannerPath)) {
        media.banner = fs.readFileSync(bannerPath)
    }
} catch (e) {
    console.error('Failed to load media/Lynae-MD.png:', e.message)
}

// Prompt Input Terminal
function question(prompt) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close()
            resolve(answer)
        })
    })
}

// Pairing function untuk meminta nomor bot dan melakukan pairing
async function requestPairing(sock) {
    try {
        // Cek apakah sudah terdaftar
        if (sock.authState?.creds?.registered) {
            return true // Sudah terdaftar, tidak perlu pairing
        }

        console.log(chalk.yellow('\n⚠️  Device not registered. Starting pairing process...\n'))
        
        // Ambil nomor bot dari config, jika tidak ada maka minta input
        let phoneNumber = config.botNumber
        
        if (!phoneNumber) {
            // Request phone number
            phoneNumber = await question(chalk.cyan('Enter your WhatsApp phone number (with country code, e.g., +6282326517561): '))
            
            if (!phoneNumber) {
                console.log(chalk.red('❌ Phone number is required!'))
                return false
            }
        } else {
            console.log(chalk.cyan(`📱 Using bot number from config: ${phoneNumber}`))
        }

        // Clean and validate phone number
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '')
        
        if (cleanNumber.length < 10) {
            console.log(chalk.red('❌ Invalid phone number format!'))
            return false
        }

        console.log(chalk.yellow(`\n📞 Requesting pairing code for: +${cleanNumber}...\n`))

        // Add small delay to ensure connection is ready
        await new Promise(resolve => setTimeout(resolve, 3000))

        try {
            const code = await sock.requestPairingCode(cleanNumber)
            
            // Format code properly (should be 8 characters)
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code
            
            console.log(chalk.green('\n' + '═'.repeat(60)))
            console.log(chalk.green.bold(`         🔐 YOUR PAIRING CODE: ${formattedCode}`))
            console.log(chalk.green('═'.repeat(60)))
            console.log(chalk.cyan('\n📱 How to pair:'))
            console.log(chalk.white('   1. Open WhatsApp on your phone'))
            console.log(chalk.white('   2. Tap Menu (⋮) or Settings ⚙️'))
            console.log(chalk.white('   3. Tap "Linked Devices"'))
            console.log(chalk.white('   4. Tap "Link a Device"'))
            console.log(chalk.white('   5. Tap "Link with phone number instead"'))
            console.log(chalk.white(`   6. Enter this code: ${formattedCode}`))
            console.log(chalk.yellow('\n⏳ Waiting for you to enter the code...\n'))
            
            return true
        } catch (err) {
            console.log(chalk.red(`\n❌ Failed to request pairing code: ${err.message}`))
            console.log(chalk.yellow('💡 Tips:'))
            console.log(chalk.white('   - Make sure your internet connection is stable'))
            console.log(chalk.white('   - Check if the phone number format is correct'))
            console.log(chalk.white('   - Try deleting the LynaeSession folder and run again'))
            return false
        }
    } catch (error) {
        console.error(chalk.red('Error in pairing process:'), error)
        return false
    }
}

// Export handler untuk digunakan di index.js
export default handler

// Export config, media, dan pairing function
export { config, media, requestPairing }