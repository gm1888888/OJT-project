const { execSync } = require('child_process');

try {
    console.log('Detected file change. Syncing to GitHub...');
    // Stage all changes
    execSync('git add .');
    
    // Commit the changes (it will fail silently if there's nothing new to commit)
    try {
        execSync('git commit -m "Auto-update from local save"');
    } catch (e) {
        // No changes to commit
    }

    // Push to GitHub
    execSync('git push origin master');
    console.log('✅ Successfully pushed to GitHub!');
} catch (error) {
    console.error('❌ Failed to sync to GitHub:', error.message);
}
