// bot.js - ফিক্স করা (কমান্ড কাজ করবে)
require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

// ========================================
// ১. কনফিগারেশন
// ========================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8801488172:AAFPwi17tgFalw0u56Jf5O24YEVH3KBdKsc';
const ADMIN_IDS = (process.env.ADMIN_IDS || '8279612640').split(',').map(id => id.trim());

// এপিআই ইউআরএল
const LOGIN_URL = process.env.LOGIN_URL || 'https://dhakapolytechnic.com/api/auth/sign-in/email';
const SEARCH_URL = process.env.SEARCH_URL || 'https://dhakapolytechnic.com/api/students';
const FILE_API_URL = process.env.FILE_API_URL || 'https://dhakapolytechnic.com/api/files';
const RESULT_API_URL = process.env.RESULT_API_URL || 'https://btebresultszone.com/api/student-results';

const EMAIL = process.env.EMAIL || 'otsshamol@gmail.com';
const PASSWORD = process.env.PASSWORD || 'oT$@2007';

const USERS_FILE = 'users.json';
const HISTORY_FILE = 'history.json';
const SETTINGS_FILE = 'settings.json';

// ========================================
// ২. ডেটাবেস ফাংশন
// ========================================

function loadJSON(file) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error(`❌ ${file} লোড করতে সমস্যা:`, error);
        return {};
    }
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`❌ ${file} সেভ করতে সমস্যা:`, error);
    }
}

function getUsers() { return loadJSON(USERS_FILE); }
function saveUsers(users) { saveJSON(USERS_FILE, users); }
function getUser(userId) { return getUsers()[userId] || null; }
function updateUser(userId, data) {
    const users = getUsers();
    users[userId] = data;
    saveUsers(users);
}

function getHistory() { return loadJSON(HISTORY_FILE); }
function saveHistory(history) { saveJSON(HISTORY_FILE, history); }
function addHistory(userId, roll, result, studentInfo = null) {
    const history = getHistory();
    if (!history[userId]) history[userId] = [];
    history[userId].push({
        roll: roll,
        timestamp: new Date().toISOString(),
        result: result ? 'found' : 'not_found',
        studentInfo: studentInfo
    });
    if (history[userId].length > 100) {
        history[userId] = history[userId].slice(-100);
    }
    saveHistory(history);
}

function getSettings() { return loadJSON(SETTINGS_FILE); }
function saveSettings(settings) { saveJSON(SETTINGS_FILE, settings); }

// ========================================
// ৩. সেশন ম্যানেজার
// ========================================

class SessionManager {
    constructor() {
        this.cookies = null;
        this.lastLogin = null;
        this.axiosInstance = axios.create({
            timeout: 30000,
            withCredentials: true
        });
    }

    async login() {
        try {
            const response = await this.axiosInstance.post(LOGIN_URL, {
                email: EMAIL,
                password: PASSWORD
            });
            if (response.status === 200) {
                const cookies = response.headers['set-cookie'];
                if (cookies) {
                    this.cookies = cookies.join('; ');
                    this.lastLogin = new Date();
                    console.log('✅ লগইন সফল!');
                    return true;
                }
            }
            console.log('❌ লগইন ব্যর্থ:', response.status);
            return false;
        } catch (error) {
            console.error('❌ লগইন এরর:', error.message);
            return false;
        }
    }

    async searchStudent(roll) {
        if (!this.cookies || (new Date() - this.lastLogin) > 3600000) {
            console.log('🔄 রি-লগইন হচ্ছে...');
            if (!await this.login()) return null;
        }

        try {
            const response = await this.axiosInstance.get(
                `${SEARCH_URL}?search=${roll}`,
                { headers: { 'Cookie': this.cookies } }
            );
            if (response.status === 401) {
                console.log('🔄 কুকি এক্সপায়ার! রি-লগইন...');
                if (await this.login()) {
                    const retryResponse = await this.axiosInstance.get(
                        `${SEARCH_URL}?search=${roll}`,
                        { headers: { 'Cookie': this.cookies } }
                    );
                    if (retryResponse.status === 200) return retryResponse.data;
                }
                return null;
            }
            if (response.status === 200) return response.data;
            return null;
        } catch (error) {
            console.error('❌ সার্চ এরর:', error.message);
            return null;
        }
    }

    async getFile(photoFileId) {
        if (!this.cookies || (new Date() - this.lastLogin) > 3600000) {
            if (!await this.login()) return null;
        }
        try {
            const response = await this.axiosInstance.get(
                `${FILE_API_URL}/${photoFileId}`,
                {
                    headers: { 'Cookie': this.cookies },
                    responseType: 'stream'
                }
            );
            if (response.status === 401) {
                if (await this.login()) {
                    const retryResponse = await this.axiosInstance.get(
                        `${FILE_API_URL}/${photoFileId}`,
                        {
                            headers: { 'Cookie': this.cookies },
                            responseType: 'stream'
                        }
                    );
                    if (retryResponse.status === 200) return retryResponse;
                }
                return null;
            }
            if (response.status === 200) return response;
            return null;
        } catch (error) {
            console.error('❌ ফাইল ডাউনলোড এরর:', error.message);
            return null;
        }
    }

    async getResult(roll) {
        try {
            const response = await this.axiosInstance.get(
                `${RESULT_API_URL}?roll=${roll}&curriculumId=diploma_in_engineering`
            );
            if (response.status === 200 && response.data.success) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('❌ রেজাল্ট এরর:', error.message);
            return null;
        }
    }
}

const session = new SessionManager();

// ========================================
// ৪. ইউটিলিটি ফাংশন
// ========================================

function isAdmin(userId) {
    return ADMIN_IDS.includes(String(userId));
}

// স্টুডেন্ট ডেটা ফরম্যাট
function formatStudentData(student) {
    let reply = '🎓 **Student Information**\n';
    reply += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    reply += `👤 **Name (Bangla):** ${student.nameBn || 'N/A'}\n`;
    reply += `👤 **Name (English):** ${student.name || 'N/A'}\n`;
    reply += `🔢 **Roll:** ${student.roll || 'N/A'}\n`;
    reply += `📋 **Reg:** ${student.reg || 'N/A'}\n`;
    reply += `📚 **Department:** ${student.dept || 'N/A'}\n`;
    reply += `🕐 **Shift:** ${student.shift || 'N/A'}\n`;
    reply += `📅 **Session:** ${student.session || 'N/A'}\n\n`;
    reply += `👨‍👦 **Father:** ${student.fatherBn || 'N/A'}\n`;
    reply += `👩‍👦 **Mother:** ${student.motherBn || 'N/A'}\n\n`;
    reply += `🩸 **Blood Group:** ${student.bloodGroup || 'N/A'}\n`;
    reply += `📱 **Mobile:** ${student.mobile || 'N/A'}\n`;
    reply += `📞 **Guardian:** ${student.guardianMobile || 'N/A'}\n\n`;
    reply += `🏠 **Address:**\n`;
    reply += `Village: ${student.village || 'N/A'}\n`;
    reply += `Post: ${student.post || 'N/A'}\n`;
    reply += `Upazila: ${student.upazila || 'N/A'}\n`;
    reply += `District: ${student.district || 'N/A'}\n`;
    reply += `\n📌 **Status:** ${student.status || 'N/A'}`;
    return reply;
}

// রেজাল্ট ফরম্যাট
function formatResultData(resultData, roll) {
    if (!resultData || !resultData.data || resultData.data.length === 0) {
        return null;
    }

    let mainData = null;
    for (const item of resultData.data) {
        if (item.regulation === 2022 && item.semesterResults && item.semesterResults.length > 0) {
            mainData = item;
            break;
        }
    }
    
    if (!mainData) {
        mainData = resultData.data[0];
    }
    
    const studentData = mainData;
    
    let reply = '📊 **Student Result**\n';
    reply += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    reply += `🔢 **Roll:** ${studentData.roll || 'N/A'}\n`;
    reply += `🏫 **Institute:** ${studentData.institute?.name || 'N/A'}\n`;
    reply += `📚 **Curriculum:** ${studentData.curriculumId || 'N/A'}\n`;
    reply += `📅 **Regulation:** ${studentData.regulation || 'N/A'}\n\n`;

    if (studentData.semesterResults && studentData.semesterResults.length > 0) {
        reply += '📈 **Semester-wise Results:**\n';
        reply += '━━━━━━━━━━━━━━━━━━━━\n\n';
        
        const sortedSemesters = studentData.semesterResults
            .filter(s => s.semester > 0)
            .sort((a, b) => a.semester - b.semester);
        
        if (sortedSemesters.length === 0) {
            reply += '⚠️ No semester results found.\n';
        }
        
        for (const semester of sortedSemesters) {
            const semesterNum = semester.semester;
            const status = semester.status || 'unknown';
            
            let statusEmoji = '❓';
            let statusText = 'Unknown';
            if (status === 'passed') {
                statusEmoji = '✅';
                statusText = 'Passed';
            } else if (status === 'failed') {
                statusEmoji = '❌';
                statusText = 'Failed';
            }
            
            reply += `📘 **Semester ${semesterNum}:** ${statusEmoji} ${statusText}\n`;
            
            if (semester.results && semester.results.length > 0) {
                const result = semester.results[0];
                if (result.gpa !== undefined && result.gpa !== null) {
                    reply += `   • GPA: ${result.gpa.toFixed(2)}\n`;
                }
                
                if (result.failedSubjects && result.failedSubjects.length > 0) {
                    reply += `   • Failed Subjects:\n`;
                    for (const sub of result.failedSubjects) {
                        if (!sub.passed) {
                            reply += `     - ${sub.subName} (${sub.subCode})\n`;
                        }
                    }
                }
            }
            
            reply += '\n';
        }
    }

    reply += '📊 **Overall Status:**\n';
    reply += '━━━━━━━━━━━━━━━━━━━━\n';
    
    let totalSemesters = 0;
    let passedSemesters = 0;
    let failedSemesters = 0;
    
    if (studentData.semesterResults) {
        for (const semester of studentData.semesterResults) {
            if (semester.semester > 0) {
                totalSemesters++;
                if (semester.status === 'passed') {
                    passedSemesters++;
                } else if (semester.status === 'failed') {
                    failedSemesters++;
                }
            }
        }
    }
    
    if (totalSemesters > 0) {
        reply += `• Total Semesters: ${totalSemesters}\n`;
        reply += `• Passed: ${passedSemesters} ✅\n`;
        reply += `• Failed: ${failedSemesters} ❌\n`;
        
        let totalGpa = 0;
        let gpaCount = 0;
        if (studentData.semesterResults) {
            for (const semester of studentData.semesterResults) {
                if (semester.semester > 0 && semester.status === 'passed') {
                    if (semester.results && semester.results.length > 0 && semester.results[0].gpa !== undefined) {
                        totalGpa += semester.results[0].gpa;
                        gpaCount++;
                    }
                }
            }
        }
        if (gpaCount > 0) {
            const cgpa = totalGpa / gpaCount;
            reply += `• CGPA: ${cgpa.toFixed(2)}\n`;
        }
    }

    if (studentData.currentFailedSubjects && studentData.currentFailedSubjects.length > 0) {
        reply += '\n⚠️ **Currently Failed Subjects:**\n';
        reply += '━━━━━━━━━━━━━━━━━━━━\n';
        for (const sub of studentData.currentFailedSubjects) {
            if (!sub.passed) {
                reply += `• ${sub.subName} (${sub.subCode}) - Semester ${sub.originSemester || 'N/A'}\n`;
            }
        }
    }

    return reply;
}

// ========================================
// ৫. ফটো পাঠানোর ফাংশন
// ========================================

async function sendStudentPhoto(ctx, photoUrl, photoFileId, reply, roll, userId) {
    if (photoUrl) {
        try {
            await ctx.replyWithPhoto(photoUrl, {
                caption: reply,
                parse_mode: 'Markdown'
            });
            console.log(`✅ ${roll} - photoUrl থেকে ফটো পাঠানো হয়েছে`);
            return true;
        } catch (error) {
            console.log(`⚠️ photoUrl থেকে সমস্যা:`, error.message);
            if (photoFileId) {
                console.log(`🔄 photoFileId দিয়ে চেষ্টা...`);
                return await sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId);
            }
            return false;
        }
    }
    if (photoFileId) {
        return await sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId);
    }
    return false;
}

async function sendStudentPhotoFromFileId(ctx, photoFileId, reply, roll, userId) {
    try {
        const fileResponse = await session.getFile(photoFileId);
        if (!fileResponse) return false;
        const chunks = [];
        fileResponse.data.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve, reject) => {
            fileResponse.data.on('end', resolve);
            fileResponse.data.on('error', reject);
        });
        const buffer = Buffer.concat(chunks);
        await ctx.replyWithPhoto(
            { source: buffer },
            { caption: reply, parse_mode: 'Markdown' }
        );
        console.log(`✅ ${roll} - photoFileId থেকে ফটো পাঠানো হয়েছে`);
        return true;
    } catch (error) {
        console.log(`❌ photoFileId থেকে সমস্যা:`, error.message);
        return false;
    }
}

// ========================================
// ৬. টেলিগ্রাম বট
// ========================================

const bot = new Telegraf(TELEGRAM_TOKEN);

// ========== অ্যাডমিন মিডলওয়্যার ==========
async function adminOnly(ctx, next) {
    try {
        const userId = ctx.from.id;
        console.log(`🔍 Admin check for user: ${userId}`);
        
        if (!isAdmin(userId)) {
            await ctx.reply('⛔ This command is only for admins.');
            return;
        }
        console.log(`✅ Admin verified: ${userId}`);
        await next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        await ctx.reply('⚠️ Admin check failed.');
    }
}

// ========================================
// ৬.এ ইউজার কমান্ড (সিম্পল রিপ্লাই)
// ========================================

bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id;
        console.log(`✅ /start from: ${userId}`);
        
        let user = getUser(userId);
        if (!user) {
            user = {
                total_searches: 0,
                joined: new Date().toISOString()
            };
            updateUser(userId, user);
        }
        
        const isAdminUser = isAdmin(userId);
        let msg = `🎓 Student Information Bot\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `🔍 Send your roll number.\n`;
        msg += `Example: 240363 or 2403631\n\n`;
        msg += `📊 Your Status:\n`;
        msg += `• Total Searches: ${user.total_searches || 0}\n`;
        if (isAdminUser) msg += `• 👑 Admin\n`;
        msg += `\n📸 Get complete information with photo!`;
        if (isAdminUser) msg += `\n\n/admin - Admin Panel`;
        
        await ctx.reply(msg);
    } catch (error) {
        console.error('Start error:', error);
        await ctx.reply('⚠️ Error starting bot.');
    }
});

bot.command('help', async (ctx) => {
    try {
        console.log(`✅ /help from: ${ctx.from.id}`);
        const isAdminUser = isAdmin(ctx.from.id);
        let msg = `📖 How to use:\n\n`;
        msg += `1️⃣ /start - Start the bot\n`;
        msg += `2️⃣ Send your roll number\n`;
        msg += `3️⃣ Bot will find the information\n\n`;
        msg += `⚡ Commands:\n`;
        msg += `• /about - About the bot\n`;
        msg += `• /stats - Your statistics`;
        if (isAdminUser) {
            msg += `\n\n👑 Admin Commands:\n`;
            msg += `• /admin - Admin Panel\n`;
            msg += `• /broadcast - Broadcast message\n`;
            msg += `• /users - User list\n`;
            msg += `• /stats_all - All statistics\n`;
            msg += `• /history [userId] - User history`;
        }
        await ctx.reply(msg);
    } catch (error) {
        console.error('Help error:', error);
        await ctx.reply('⚠️ Error showing help.');
    }
});

bot.command('about', async (ctx) => {
    try {
        console.log(`✅ /about from: ${ctx.from.id}`);
        let msg = `🤖 About Bot:\n\n`;
        msg += `Dhaka Polytechnic Institute\n`;
        msg += `Student Information Search Bot.\n\n`;
        msg += `⚡ Features:\n`;
        msg += `• Quick search by roll\n`;
        msg += `• Information with photo\n`;
        msg += `• Result check\n`;
        msg += `• Completely free\n`;
        msg += `• 24/7 active\n`;
        msg += `• Admin panel\n\n`;
        msg += `📌 Developer: Oahid Towsif Shamol\n`;
        msg += `📅 Version: 5.2 (Result Fix)`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('About error:', error);
        await ctx.reply('⚠️ Error showing about info.');
    }
});

bot.command('stats', async (ctx) => {
    try {
        const userId = ctx.from.id;
        console.log(`✅ /stats from: ${userId}`);
        const user = getUser(userId);
        if (!user) {
            await ctx.reply('❌ Profile not found. Use /start.');
            return;
        }
        let msg = `📊 Your Statistics\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `📅 Joined: ${(user.joined || 'N/A').slice(0, 10)}\n`;
        msg += `🔢 Total Searches: ${user.total_searches || 0}\n\n`;
        msg += `🎯 Send roll number for new search.`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Stats error:', error);
        await ctx.reply('⚠️ Error showing statistics.');
    }
});

bot.command('myid', async (ctx) => {
    try {
        const userId = ctx.from.id;
        console.log(`✅ /myid from: ${userId}`);
        const isAdminUser = isAdmin(userId);
        let msg = `🆔 Your ID: ${userId}\n\n`;
        msg += `👑 Admin? ${isAdminUser ? '✅ Yes' : '❌ No'}\n\n`;
        msg += `📋 Admin List: ${ADMIN_IDS.join(', ')}`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Myid error:', error);
        await ctx.reply('⚠️ Error getting your ID.');
    }
});

// ========================================
// ৬.বি অ্যাডমিন কমান্ড (সিম্পল রিপ্লাই)
// ========================================

bot.command('admin', adminOnly, async (ctx) => {
    try {
        console.log(`✅ /admin from admin: ${ctx.from.id}`);
        const users = getUsers();
        const history = getHistory();
        const totalUsers = Object.keys(users).length;
        let totalSearches = 0;
        Object.values(users).forEach(u => {
            totalSearches += (u.total_searches || 0);
        });

        let msg = `👑 Admin Panel\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `📊 Statistics:\n`;
        msg += `• Total Users: ${totalUsers}\n`;
        msg += `• Total Searches: ${totalSearches}\n`;
        msg += `• Active Users: ${Object.keys(history).length}\n\n`;
        msg += `⚡ Commands:\n`;
        msg += `• /broadcast - Broadcast message\n`;
        msg += `• /users - User list\n`;
        msg += `• /stats_all - All statistics\n`;
        msg += `• /history [userId] - User history\n`;
        msg += `• /clear_history [userId] - Clear history\n`;
        msg += `• /delete_user [userId] - Delete user\n\n`;
        msg += `💡 Usage: /history 123456789`;
        
        await ctx.reply(msg);
    } catch (error) {
        console.error('Admin panel error:', error);
        await ctx.reply('⚠️ Error loading admin panel.');
    }
});

// ব্রডকাস্ট
bot.command('broadcast', adminOnly, async (ctx) => {
    try {
        const message = ctx.message.text.replace('/broadcast', '').trim();
        if (!message) {
            await ctx.reply('📢 Send broadcast message:\n/broadcast Your message');
            return;
        }

        const users = getUsers();
        const userIds = Object.keys(users);
        let sent = 0, failed = 0;

        const statusMsg = await ctx.reply(`⏳ Sending to ${userIds.length} users...`);

        for (const userId of userIds) {
            try {
                await ctx.telegram.sendMessage(userId, 
                    `📢 Admin Message:\n\n${message}`
                );
                sent++;
            } catch (error) {
                failed++;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            null,
            `✅ Broadcast Complete!\n\n📤 Success: ${sent}\n❌ Failed: ${failed}\n👥 Total: ${userIds.length}`
        );
    } catch (error) {
        console.error('Broadcast error:', error);
        await ctx.reply('⚠️ Error sending broadcast.');
    }
});

// ইউজার লিস্ট
bot.command('users', adminOnly, async (ctx) => {
    try {
        const users = getUsers();
        const userIds = Object.keys(users);
        
        if (userIds.length === 0) {
            await ctx.reply('📭 No users found.');
            return;
        }

        let msg = `👥 User List\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        const recentUsers = userIds.slice(-20);
        
        for (const id of recentUsers) {
            const user = users[id];
            const name = user.name || 'Unknown';
            const searches = user.total_searches || 0;
            msg += `🆔 ${id}\n`;
            msg += `👤 ${name}\n`;
            msg += `🔢 ${searches} searches\n`;
            msg += `📅 ${(user.joined || 'N/A').slice(0, 10)}\n\n`;
        }

        msg += `📊 Total: ${userIds.length} users`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Users list error:', error);
        await ctx.reply('⚠️ Error loading user list.');
    }
});

// সব পরিসংখ্যান
bot.command('stats_all', adminOnly, async (ctx) => {
    try {
        const users = getUsers();
        const history = getHistory();
        const totalUsers = Object.keys(users).length;
        let totalSearches = 0;
        let activeUsers = 0;

        Object.values(users).forEach(u => {
            totalSearches += (u.total_searches || 0);
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        for (const [userId, histories] of Object.entries(history)) {
            const recent = histories.filter(h => new Date(h.timestamp) > sevenDaysAgo);
            if (recent.length > 0) activeUsers++;
        }

        let msg = `📊 Complete Statistics\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `👥 Users:\n`;
        msg += `• Total: ${totalUsers}\n`;
        msg += `• Active last 7 days: ${activeUsers}\n\n`;
        msg += `🔍 Searches:\n`;
        msg += `• Total: ${totalSearches}\n`;
        msg += `• Avg/User: ${totalUsers > 0 ? (totalSearches/totalUsers).toFixed(1) : 0}\n\n`;
        msg += `📈 Activity:\n`;
        msg += `• Total history: ${Object.values(history).reduce((sum, h) => sum + h.length, 0)}`;
        
        await ctx.reply(msg);
    } catch (error) {
        console.error('Stats all error:', error);
        await ctx.reply('⚠️ Error loading statistics.');
    }
});

// ইউজার হিস্ট্রি
bot.command('history', adminOnly, async (ctx) => {
    try {
        const parts = ctx.message.text.split(' ');
        const targetUserId = parts[1];

        if (!targetUserId) {
            await ctx.reply('❌ Provide user ID:\n/history 123456789');
            return;
        }

        const history = getHistory();
        const userHistory = history[targetUserId] || [];

        if (userHistory.length === 0) {
            await ctx.reply(`📭 User ${targetUserId} has no history.`);
            return;
        }

        const user = getUser(targetUserId);
        let msg = `📜 User History\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🆔 ${targetUserId}\n`;
        if (user) {
            msg += `👤 Name: ${user.name || 'N/A'}\n`;
            msg += `🔢 Total searches: ${user.total_searches || 0}\n`;
        }
        msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        const recent = userHistory.slice(-10).reverse();
        for (const entry of recent) {
            msg += `🎯 Roll: ${entry.roll}\n`;
            msg += `📅 ${new Date(entry.timestamp).toLocaleString()}\n`;
            msg += `${entry.result === 'found' ? '✅ Found' : '❌ Not found'}\n\n`;
        }

        msg += `📊 Total: ${userHistory.length} searches`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('History error:', error);
        await ctx.reply('⚠️ Error loading history.');
    }
});

// হিস্ট্রি ক্লিয়ার
bot.command('clear_history', adminOnly, async (ctx) => {
    try {
        const parts = ctx.message.text.split(' ');
        const targetUserId = parts[1];

        if (!targetUserId) {
            await ctx.reply('❌ Provide user ID:\n/clear_history 123456789');
            return;
        }

        const history = getHistory();
        if (history[targetUserId]) {
            delete history[targetUserId];
            saveHistory(history);
            await ctx.reply(`✅ User ${targetUserId}'s history cleared.`);
        } else {
            await ctx.reply(`❌ User ${targetUserId} has no history.`);
        }
    } catch (error) {
        console.error('Clear history error:', error);
        await ctx.reply('⚠️ Error clearing history.');
    }
});

// ইউজার ডিলিট
bot.command('delete_user', adminOnly, async (ctx) => {
    try {
        const parts = ctx.message.text.split(' ');
        const targetUserId = parts[1];

        if (!targetUserId) {
            await ctx.reply('❌ Provide user ID:\n/delete_user 123456789');
            return;
        }

        const users = getUsers();
        if (users[targetUserId]) {
            delete users[targetUserId];
            saveUsers(users);
            
            const history = getHistory();
            if (history[targetUserId]) {
                delete history[targetUserId];
                saveHistory(history);
            }
            
            await ctx.reply(`✅ User ${targetUserId} deleted.`);
        } else {
            await ctx.reply(`❌ User ${targetUserId} not found.`);
        }
    } catch (error) {
        console.error('Delete user error:', error);
        await ctx.reply('⚠️ Error deleting user.');
    }
});

// ========================================
// ৬.সি সার্চ হ্যান্ডলার
// ========================================

bot.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const roll = ctx.message.text.trim();

        if (roll.startsWith('/')) return;

        console.log(`🔍 Search: user=${userId}, roll=${roll}`);

        if (!/^\d{6,7}$/.test(roll)) {
            await ctx.reply(`❌ Invalid Roll Number!\n\nRoll number must be 6 or 7 digits.\nExample: 240363 or 2403631`);
            return;
        }

        const waitingMsg = await ctx.reply(`⏳ Searching...\n🎯 Roll: ${roll}`);

        const studentResult = await session.searchStudent(roll);
        let studentInfo = null;
        let studentFound = false;

        const resultData = await session.getResult(roll);

        if (studentResult && studentResult.rows && studentResult.rows.length > 0) {
            studentInfo = studentResult.rows[0];
            studentFound = true;
        }

        const user = getUser(userId) || { total_searches: 0 };
        user.total_searches = (user.total_searches || 0) + 1;
        user.joined = user.joined || new Date().toISOString();
        updateUser(userId, user);

        const hasResult = resultData && resultData.success && resultData.data && resultData.data.length > 0;

        addHistory(userId, roll, studentFound || hasResult, studentInfo);

        await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

        if (studentFound && studentInfo) {
            const studentReply = formatStudentData(studentInfo);
            const photoUrl = studentInfo.photoUrl;
            const photoFileId = studentInfo.photoFileId;
            
            const photoSent = await sendStudentPhoto(ctx, photoUrl, photoFileId, studentReply, roll, userId);
            
            if (!photoSent) {
                await ctx.reply(`📝 Information found (without photo)\n\n${studentReply}`);
            }
        }

        if (hasResult) {
            const resultReply = formatResultData(resultData, roll);
            if (resultReply) {
                await ctx.reply(resultReply);
            }
        }

        if (!studentFound && !hasResult) {
            await ctx.reply(
                `❌ No information found!\n\nRoll: ${roll}\n\n🔍 Possible reasons:\n• Wrong roll number\n• Student not registered yet\n• Server issue`
            );
        }
    } catch (error) {
        console.error('Search error:', error);
        await ctx.reply('⚠️ Error processing your request. Please try again.');
    }
});

// ========================================
// ৭. এরর হ্যান্ডলার
// ========================================

bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    ctx.reply('⚠️ Server error! Please try again later.');
});

// ========================================
// ৮. বট স্টার্ট এবং ওয়েব সার্ভার
// ========================================

console.log('🤖 Bot starting...');
console.log('👑 Admin IDs:', ADMIN_IDS);

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot is running!');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const server = app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});

bot.launch({
    dropPendingUpdates: true
})
.then(() => {
    console.log('✅ Bot ready! Send /start on Telegram');
    console.log('📋 Admin panel: /admin');
    console.log(`👑 Admin users: ${ADMIN_IDS.join(', ')}`);
})
.catch((error) => {
    console.error('❌ Bot launch error:', error);
    process.exit(1);
});

process.once('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down...');
    bot.stop('SIGINT');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.once('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    bot.stop('SIGTERM');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});