import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Store loaded plugins and their metadata
const plugins = []
const pluginCache = new Map() // Cache untuk menyimpan module URL dan timestamp

// Function to load a single plugin
async function loadPlugin(file, isReload = false) {
    try {
        const pluginPath = path.join(__dirname, file)
        
        // Check if file exists
        if (!fs.existsSync(pluginPath)) {
            return { success: false, file, error: 'File not found' }
        }
        
        const stats = fs.statSync(pluginPath)
        const pluginUrl = pathToFileURL(pluginPath).href
        
        // For hot reload, use timestamp to bust cache
        // ESM modules are cached by URL, so adding timestamp forces reload
        const cacheBustUrl = isReload ? `${pluginUrl}?t=${Date.now()}` : pluginUrl
        
        // Import plugin (with cache busting if reloading)
        const pluginModule = await import(cacheBustUrl)
        const plugin = pluginModule.default || pluginModule
        
        if (plugin && typeof plugin === 'function') {
            // Find and remove old plugin if exists
            const existingIndex = pluginCache.has(file) 
                ? pluginCache.get(file).index 
                : -1
            
            if (existingIndex !== -1 && existingIndex < plugins.length) {
                plugins.splice(existingIndex, 1)
                // Update indices for other plugins
                pluginCache.forEach((meta, fname) => {
                    if (meta.index > existingIndex) {
                        meta.index--
                    }
                })
            }
            
            // Add new plugin
            const newIndex = plugins.push(plugin) - 1
            
            // Store metadata
            pluginCache.set(file, {
                url: pluginUrl,
                mtime: stats.mtimeMs,
                index: newIndex
            })
            
            return { success: true, file, plugin }
        } else {
            return { success: false, file, error: 'Plugin is not a function' }
        }
    } catch (error) {
        return { success: false, file, error: error.message }
    }
}

// Function to load all plugins
async function loadPlugins() {
    const pluginsDir = __dirname
    const files = fs.readdirSync(pluginsDir)
    
    // Clear existing plugins
    plugins.length = 0
    pluginCache.clear()
    
    for (const file of files) {
        if (file.endsWith('.js') && file !== 'index.js') {
            const result = await loadPlugin(file)
            if (result.success) {
                console.log(chalk.green(`✓ Loaded plugin: ${file}`))
            } else {
                console.error(chalk.red(`✗ Failed to load plugin ${file}:`), result.error)
            }
        }
    }
    
    return plugins
}

// Function to reload a specific plugin
async function reloadPlugin(filename) {
    if (!filename.endsWith('.js')) {
        filename = filename + '.js'
    }
    
    const result = await loadPlugin(filename, true) // true = isReload
    
    if (result.success) {
        console.log(chalk.cyan(`🔄 Reloaded plugin: ${filename}`))
        return { success: true, message: `Plugin ${filename} reloaded successfully` }
    } else {
        console.error(chalk.red(`✗ Failed to reload plugin ${filename}:`), result.error)
        return { success: false, error: result.error }
    }
}

// Function to reload all plugins
async function reloadAllPlugins() {
    console.log(chalk.yellow('🔄 Reloading all plugins...'))
    await loadPlugins()
    console.log(chalk.green(`✓ Reloaded ${plugins.length} plugins`))
    return plugins
}

// Watch for file changes in plugins directory
let watcher = null

function startWatcher() {
    if (watcher) {
        watcher.close()
    }
    
    watcher = fs.watch(__dirname, { recursive: false }, async (eventType, filename) => {
        // Ignore index.js and non-js files
        if (filename === 'index.js' || !filename.endsWith('.js')) {
            return
        }
        
        // Only handle 'change' events (file modified)
        if (eventType === 'change') {
            // Small delay to ensure file is fully written
            setTimeout(async () => {
                try {
                    const result = await reloadPlugin(filename)
                    if (result.success) {
                        console.log(chalk.green(`✓ Hot-reload: ${filename} updated`))
                    }
                } catch (error) {
                    console.error(chalk.red(`✗ Hot-reload failed for ${filename}:`), error.message)
                }
            }, 500)
        }
        
        // Handle 'rename' events (file added/removed)
        if (eventType === 'rename') {
            const filePath = path.join(__dirname, filename)
            const exists = fs.existsSync(filePath)
            
            if (exists && filename.endsWith('.js') && filename !== 'index.js') {
                // New file added
                setTimeout(async () => {
                    try {
                        const result = await loadPlugin(filename)
                        if (result.success) {
                            console.log(chalk.green(`✓ Hot-reload: ${filename} added`))
                        }
                    } catch (error) {
                        console.error(chalk.red(`✗ Hot-reload failed for ${filename}:`), error.message)
                    }
                }, 500)
            } else {
                // File removed
                const existingIndex = plugins.findIndex((p, idx) => {
                    return pluginCache.get(filename)?.index === idx
                })
                
                if (existingIndex !== -1) {
                    plugins.splice(existingIndex, 1)
                    pluginCache.delete(filename)
                    console.log(chalk.yellow(`⚠️  Plugin removed: ${filename}`))
                }
            }
        }
    })
    
    console.log(chalk.cyan('👁️  Plugin file watcher started (hot-reload enabled)'))
}

// Load plugins immediately
;(async () => {
    await loadPlugins()
    // Start file watcher for hot-reload
    startWatcher()
})()

// Export plugins array and reload functions
export default plugins
export { reloadPlugin, reloadAllPlugins, loadPlugins }