// bot.js - টাইম ও নোটিফিকেশন ফিক্স
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
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
const FEEDBACK_FILE = 'feedback.json';

// ========================================
// ২. BST টাইম ইউটিলিটি (12h Format - Corrected)
// ========================================

function getBSTTime() {
    const now = new Date();
    // BST = UTC+6
    const bstOffset = 6 * 60 * 60 * 1000;
    const bstTime = new Date(now.getTime() + bstOffset);
    return bstTime;
}

function formatBSTDate12h(date) {
    const bstDate = date || getBSTTime();
    const options = {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Dhaka'
    };
    return bstDate.toLocaleString('en-US', options);
}

function formatBSTDate12hShort(date) {
    const bstDate = date || getBSTTime();
    const options = {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Dhaka'
    };
    return bstDate.toLocaleString('en-US', options);
}

function getBSTTimestamp() {
    return getBSTTime().toISOString();
}

function getBSTTime12h() {
    return formatBSTDate12h();
}

// ========================================
// ৩. ডেটাবেস ফাংশন
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
        timestamp: getBSTTimestamp(),
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

// ফিডব্যাক ফাংশন
function getFeedbacks() { return loadJSON(FEEDBACK_FILE); }
function saveFeedbacks(feedbacks) { saveJSON(FEEDBACK_FILE, feedbacks); }
function addFeedback(userId, feedback, username = null) {
    const feedbacks = getFeedbacks();
    if (!feedbacks[userId]) feedbacks[userId] = [];
    feedbacks[userId].push({
        feedback: feedback,
        timestamp: getBSTTimestamp(),
        username: username
    });
    saveFeedbacks(feedbacks);
}

// ========================================
// ৪. সেশন ম্যানেজার
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
// ৫. ইউটিলিটি ফাংশন
// ========================================

function isAdmin(userId) {
    return ADMIN_IDS.includes(String(userId));
}

function getUserDisplayName(user) {
    if (!user) return 'Unknown';
    let name = '';
    if (user.first_name) name += user.first_name;
    if (user.last_name) name += ' ' + user.last_name;
    return name.trim() || 'Unknown';
}

function getUserDisplayWithUsername(user) {
    if (!user) return 'Unknown';
    let display = getUserDisplayName(user);
    if (user.username) {
        display += ` (@${user.username})`;
    }
    return display;
}

// ========================================
// ৬. স্টুডেন্ট ডেটা ফরম্যাট
// ========================================

function formatStudentData(student) {
    let reply = '🎓 Student Information\n';
    reply += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    reply += `👤 Name (Bangla): ${student.nameBn || student.name_bn || 'N/A'}\n`;
    reply += `👤 Name (English): ${student.name || student.name_en || 'N/A'}\n`;
    reply += `🔢 Roll: ${student.roll || 'N/A'}\n`;
    reply += `📋 Reg: ${student.reg || student.registration || 'N/A'}\n`;
    reply += `📚 Department: ${student.department || student.dept || 'N/A'}\n`;
    reply += `🕐 Shift: ${student.shift || 'N/A'}\n`;
    reply += `📅 Session: ${student.session || student.sessionYear || 'N/A'}\n\n`;
    reply += `👨‍👦 Father: ${student.fatherBn || student.father_name || 'N/A'}\n`;
    reply += `👩‍👦 Mother: ${student.motherBn || student.mother_name || 'N/A'}\n\n`;
    reply += `🩸 Blood Group: ${student.bloodGroup || student.blood_group || 'N/A'}\n`;
    reply += `📱 Mobile: ${student.mobile || student.phone || 'N/A'}\n`;
    reply += `📞 Guardian: ${student.guardianMobile || student.guardian_phone || 'N/A'}\n\n`;
    reply += `🏠 Address:\n`;
    reply += `Village: ${student.village || 'N/A'}\n`;
    reply += `Post: ${student.post || student.postOffice || 'N/A'}\n`;
    reply += `Upazila: ${student.upazila || student.thana || 'N/A'}\n`;
    reply += `District: ${student.district || 'N/A'}\n`;
    reply += `\n📌 Status: ${student.status || 'Active'}`;
    return reply;
}

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
    
    let reply = '📊 Student Result\n';
    reply += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    reply += `🔢 Roll: ${studentData.roll || 'N/A'}\n`;
    reply += `🏫 Institute: ${studentData.institute?.name || 'N/A'}\n`;
    reply += `📚 Curriculum: ${studentData.curriculumId || 'N/A'}\n`;
    reply += `📅 Regulation: ${studentData.regulation || 'N/A'}\n\n`;

    if (studentData.semesterResults && studentData.semesterResults.length > 0) {
        reply += '📈 Semester-wise Results:\n';
        reply += '━━━━━━━━━━━━━━━━━━━━\n\n';
        
        const sortedSemesters = studentData.semesterResults
            .filter(s => s.semester > 0)
            .sort((a, b) => a.semester - b.semester);
        
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
            
            reply += `📘 Semester ${semesterNum}: ${statusEmoji} ${statusText}\n`;
            
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

    reply += '📊 Overall Status:\n';
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
        reply += '\n⚠️ Currently Failed Subjects:\n';
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
// ৭. ফটো পাঠানোর ফাংশন
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
// ৮. অ্যাডমিন নোটিফিকেশন ফাংশন (No Markdown)
// ========================================

async function sendAdminNotification(ctx, userId, roll, found, time, user) {
    const userName = user?.display_name || 'Unknown';
    const userUsername = user?.username ? `@${user.username}` : 'No username';
    const userInfo = ctx.from;
    const firstName = userInfo?.first_name || 'Unknown';
    const lastName = userInfo?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    
    let msg = `🔍 New Search Alert\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `👤 User: ${userName}\n`;
    msg += `🆔 ID: ${userId}\n`;
    msg += `🔸 Username: ${userUsername}\n`;
    msg += `📛 Full Name: ${fullName}\n`;
    msg += `🎯 Roll: ${roll}\n`;
    msg += `📊 Status: ${found ? '✅ Found' : '❌ Not Found'}\n`;
    msg += `🕐 Time: ${time}\n\n`;
    msg += `📊 Total Searches: ${user?.total_searches || 1}`;
    
    for (const adminId of ADMIN_IDS) {
        try {
            await ctx.telegram.sendMessage(adminId, msg);
        } catch (error) {
            console.error(`Admin notification error for ${adminId}:`, error.message);
        }
    }
}

// ========================================
// ৯. টেলিগ্রাম বট
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
// ১০. কমান্ড রেজিস্ট্রেশন
// ========================================

// Start Command
bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userInfo = ctx.from;
        console.log(`✅ /start from: ${userId} (${getUserDisplayName(userInfo)})`);
        
        let user = getUser(userId);
        if (!user) {
            user = {
                total_searches: 0,
                joined: getBSTTimestamp(),
                first_name: userInfo.first_name || '',
                last_name: userInfo.last_name || '',
                username: userInfo.username || '',
                display_name: getUserDisplayName(userInfo),
                saved_roll: null
            };
            updateUser(userId, user);
        } else {
            user.first_name = userInfo.first_name || '';
            user.last_name = userInfo.last_name || '';
            user.username = userInfo.username || '';
            user.display_name = getUserDisplayName(userInfo);
            updateUser(userId, user);
        }
        
        const isAdminUser = isAdmin(userId);
        
        const keyboard = Markup.keyboard([
            ['🔍 New Search', '📊 My Result'],
            ['ℹ️ Help', '⭐ Feedback']
        ]).resize().oneTime();
        
        let msg = `🎓 Welcome ${user.display_name || 'User'}!\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `🔍 Send a roll number or use the buttons below.\n`;
        msg += `Example: 240363 or 2403631\n\n`;
        msg += `📊 Your Status:\n`;
        msg += `• Total Searches: ${user.total_searches || 0}\n`;
        if (isAdminUser) msg += `• 👑 Admin\n`;
        if (user.saved_roll) msg += `• 💾 Saved Roll: ${user.saved_roll}\n`;
        msg += `• 📅 Joined: ${formatBSTDate12h(new Date(user.joined))}`;
        
        await ctx.reply(msg, keyboard);
    } catch (error) {
        console.error('Start error:', error);
        await ctx.reply('⚠️ Error starting bot.');
    }
});

// Help Command
bot.command('help', async (ctx) => {
    try {
        console.log(`✅ /help from: ${ctx.from.id}`);
        const isAdminUser = isAdmin(ctx.from.id);
        let msg = `📖 How to use the bot:\n\n`;
        msg += `1️⃣ Send a roll number or click "🔍 New Search"\n`;
        msg += `2️⃣ Bot will show student info & result\n`;
        msg += `3️⃣ Use "📊 My Result" to see saved result\n`;
        msg += `4️⃣ Give feedback with "⭐ Feedback"\n\n`;
        msg += `⚡ Commands:\n`;
        msg += `• /start - Restart bot\n`;
        msg += `• /help - Show this help\n`;
        msg += `• /stats - Your statistics\n`;
        msg += `• /myid - Your Telegram ID\n`;
        msg += `• /about - About the bot`;
        if (isAdminUser) {
            msg += `\n\n👑 Admin Commands:\n`;
            msg += `• /admin - Admin Panel`;
        }
        await ctx.reply(msg);
    } catch (error) {
        console.error('Help error:', error);
        await ctx.reply('⚠️ Error showing help.');
    }
});

// Stats Command
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
        msg += `👤 Name: ${user.display_name || 'Unknown'}\n`;
        if (user.username) msg += `🔸 Username: @${user.username}\n`;
        msg += `📅 Joined: ${formatBSTDate12h(new Date(user.joined))}\n`;
        msg += `🔢 Total Searches: ${user.total_searches || 0}\n`;
        if (user.saved_roll) msg += `💾 Saved Roll: ${user.saved_roll}\n\n`;
        msg += `🎯 Send roll number for new search.`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Stats error:', error);
        await ctx.reply('⚠️ Error showing statistics.');
    }
});

// MyID Command
bot.command('myid', async (ctx) => {
    try {
        const userId = ctx.from.id;
        console.log(`✅ /myid from: ${userId}`);
        const isAdminUser = isAdmin(userId);
        const user = getUser(userId);
        let msg = `🆔 Your ID: ${userId}\n\n`;
        msg += `👤 Name: ${user?.display_name || 'Unknown'}\n`;
        if (user?.username) msg += `🔸 Username: @${user.username}\n`;
        if (user?.saved_roll) msg += `💾 Saved Roll: ${user.saved_roll}\n`;
        msg += `👑 Admin: ${isAdminUser ? '✅ Yes' : '❌ No'}\n\n`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Myid error:', error);
        await ctx.reply('⚠️ Error getting your ID.');
    }
});

// About Command
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
        msg += `• Save favorite roll\n`;
        msg += `• Feedback system\n`;
        msg += `• Completely free\n`;
        msg += `• 24/7 active\n\n`;
        msg += `📌 Developer: Oahid Towsif Shamol\n`;
        msg += `📅 Version: 6.3 (Time Fixed)\n`;
        msg += `🕐 Time Zone: BST (UTC+06:00) 12h Format`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('About error:', error);
        await ctx.reply('⚠️ Error showing about info.');
    }
});

// ========================================
// ১১. অ্যাডমিন কমান্ড
// ========================================

bot.command('admin', adminOnly, async (ctx) => {
    try {
        console.log(`✅ /admin from admin: ${ctx.from.id}`);
        const users = getUsers();
        const history = getHistory();
        const feedbacks = getFeedbacks();
        const totalUsers = Object.keys(users).length;
        let totalSearches = 0;
        Object.values(users).forEach(u => {
            totalSearches += (u.total_searches || 0);
        });
        const totalFeedbacks = Object.values(feedbacks).reduce((sum, f) => sum + f.length, 0);

        let msg = `👑 Admin Panel\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `📊 Statistics:\n`;
        msg += `• Total Users: ${totalUsers}\n`;
        msg += `• Total Searches: ${totalSearches}\n`;
        msg += `• Active Users: ${Object.keys(history).length}\n`;
        msg += `• Total Feedbacks: ${totalFeedbacks}\n\n`;
        msg += `⚡ Commands:\n`;
        msg += `• /broadcast - Broadcast message\n`;
        msg += `• /users - User list\n`;
        msg += `• /stats_all - All statistics\n`;
        msg += `• /history [userId] - User history\n`;
        msg += `• /feedback_list - View all feedbacks\n`;
        msg += `• /clear_feedback - Clear all feedbacks\n`;
        msg += `• /delete_user [userId] - Delete user\n\n`;
        msg += `💡 Usage: /history 123456789`;
        
        await ctx.reply(msg);
    } catch (error) {
        console.error('Admin panel error:', error);
        await ctx.reply('⚠️ Error loading admin panel.');
    }
});

// Broadcast Command
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

// Users List Command
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
            const name = user.display_name || user.first_name || 'Unknown';
            const username = user.username ? `@${user.username}` : '';
            const searches = user.total_searches || 0;
            const joined = user.joined ? formatBSTDate12hShort(new Date(user.joined)) : 'N/A';
            
            msg += `🆔 ${id}\n`;
            msg += `👤 ${name}`;
            if (username) msg += ` (${username})`;
            msg += `\n`;
            msg += `🔢 ${searches} searches\n`;
            msg += `📅 ${joined}\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        }

        msg += `\n📊 Total: ${userIds.length} users`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Users list error:', error);
        await ctx.reply('⚠️ Error loading user list.');
    }
});

// Stats All Command
bot.command('stats_all', adminOnly, async (ctx) => {
    try {
        const users = getUsers();
        const history = getHistory();
        const feedbacks = getFeedbacks();
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
        
        const totalFeedbacks = Object.values(feedbacks).reduce((sum, f) => sum + f.length, 0);

        let msg = `📊 Complete Statistics\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `👥 Users:\n`;
        msg += `• Total: ${totalUsers}\n`;
        msg += `• Active last 7 days: ${activeUsers}\n\n`;
        msg += `🔍 Searches:\n`;
        msg += `• Total: ${totalSearches}\n`;
        msg += `• Avg/User: ${totalUsers > 0 ? (totalSearches/totalUsers).toFixed(1) : 0}\n\n`;
        msg += `📈 Activity:\n`;
        msg += `• Total history: ${Object.values(history).reduce((sum, h) => sum + h.length, 0)}\n`;
        msg += `📝 Feedbacks: ${totalFeedbacks}`;
        
        await ctx.reply(msg);
    } catch (error) {
        console.error('Stats all error:', error);
        await ctx.reply('⚠️ Error loading statistics.');
    }
});

// History Command
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
            const name = user.display_name || user.first_name || 'Unknown';
            const username = user.username ? ` (@${user.username})` : '';
            msg += `👤 ${name}${username}\n`;
            msg += `🔢 Total searches: ${user.total_searches || 0}\n`;
        }
        msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        const recent = userHistory.slice(-10).reverse();
        for (const entry of recent) {
            const time = entry.timestamp ? formatBSTDate12hShort(new Date(entry.timestamp)) : 'N/A';
            msg += `🎯 Roll: ${entry.roll}\n`;
            msg += `📅 ${time}\n`;
            msg += `${entry.result === 'found' ? '✅ Found' : '❌ Not found'}\n\n`;
        }

        msg += `📊 Total: ${userHistory.length} searches`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('History error:', error);
        await ctx.reply('⚠️ Error loading history.');
    }
});

// Clear History Command
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

// Delete User Command
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

// Feedback List Command
bot.command('feedback_list', adminOnly, async (ctx) => {
    try {
        const feedbacks = getFeedbacks();
        const feedbackKeys = Object.keys(feedbacks);
        
        if (feedbackKeys.length === 0) {
            await ctx.reply('📭 No feedbacks found.');
            return;
        }
        
        let msg = `📝 Feedback List\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        let total = 0;
        for (const userId of feedbackKeys.slice(-10)) {
            const userFeedbacks = feedbacks[userId];
            const user = getUser(userId);
            const name = user?.display_name || 'Unknown';
            
            msg += `👤 ${name}\n`;
            msg += `🆔 ${userId}\n`;
            
            const recent = userFeedbacks.slice(-3);
            for (const fb of recent) {
                const time = fb.timestamp ? formatBSTDate12hShort(new Date(fb.timestamp)) : 'N/A';
                msg += `   📝 ${fb.feedback}\n`;
                msg += `   📅 ${time}\n`;
            }
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
            total += userFeedbacks.length;
        }
        
        msg += `\n📊 Total Feedbacks: ${total}`;
        await ctx.reply(msg);
    } catch (error) {
        console.error('Feedback list error:', error);
        await ctx.reply('⚠️ Error loading feedbacks.');
    }
});

// Clear Feedback Command
bot.command('clear_feedback', adminOnly, async (ctx) => {
    try {
        saveFeedbacks({});
        await ctx.reply('✅ All feedbacks cleared.');
    } catch (error) {
        console.error('Clear feedback error:', error);
        await ctx.reply('⚠️ Error clearing feedbacks.');
    }
});

// ========================================
// ১২. কুইক রিপ্লাই বাটন হ্যান্ডলার
// ========================================

bot.hears('🔍 New Search', async (ctx) => {
    await ctx.reply('📝 Please enter your roll number:\nExample: 240363');
});

bot.hears('📊 My Result', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const user = getUser(userId);
        
        if (!user || !user.saved_roll) {
            await ctx.reply(
                '❌ No saved roll number found!\n\n' +
                '🔍 First search a student, then use "Save Roll" button to save.',
                Markup.keyboard([
                    ['🔍 New Search'],
                    ['ℹ️ Help', '⭐ Feedback']
                ]).resize().oneTime()
            );
            return;
        }
        
        const roll = user.saved_roll;
        await ctx.reply(`⏳ Searching for saved roll: ${roll}...`);
        
        const resultData = await session.getResult(roll);
        const studentResult = await session.searchStudent(roll);
        
        let resultShown = false;
        
        if (studentResult && studentResult.rows && studentResult.rows.length > 0) {
            const studentInfo = studentResult.rows[0];
            const studentReply = formatStudentData(studentInfo);
            const photoUrl = studentInfo.photoUrl;
            const photoFileId = studentInfo.photoFileId;
            
            const photoSent = await sendStudentPhoto(ctx, photoUrl, photoFileId, studentReply, roll, userId);
            
            if (!photoSent) {
                await ctx.reply(`📝 Information found (without photo)\n\n${studentReply}`);
            }
            resultShown = true;
        }
        
        if (resultData && resultData.success && resultData.data && resultData.data.length > 0) {
            const resultReply = formatResultData(resultData, roll);
            if (resultReply) {
                await ctx.reply(resultReply);
                resultShown = true;
            }
        }
        
        if (!resultShown) {
            await ctx.reply(`❌ No result found for roll: ${roll}`);
        }
        
        const keyboard = Markup.keyboard([
            ['🔍 New Search', '📊 My Result'],
            ['ℹ️ Help', '⭐ Feedback']
        ]).resize().oneTime();
        await ctx.reply('🔍 What would you like to do?', keyboard);
        
    } catch (error) {
        console.error('My Result error:', error);
        await ctx.reply('⚠️ Error getting result. Please try again.');
    }
});

bot.hears('ℹ️ Help', async (ctx) => {
    const isAdminUser = isAdmin(ctx.from.id);
    let msg = `📖 How to use:\n\n`;
    msg += `1️⃣ Send a roll number or click "🔍 New Search"\n`;
    msg += `2️⃣ Bot will show student info & result\n`;
    msg += `3️⃣ Use "📊 My Result" to see saved result\n`;
    msg += `4️⃣ Give feedback with "⭐ Feedback"\n\n`;
    msg += `⚡ Commands:\n`;
    msg += `• /start - Restart bot\n`;
    msg += `• /help - Show this help\n`;
    msg += `• /stats - Your statistics\n`;
    msg += `• /myid - Your Telegram ID\n`;
    msg += `• /about - About the bot`;
    if (isAdminUser) {
        msg += `\n\n👑 Admin Commands:\n`;
        msg += `• /admin - Admin Panel`;
    }
    await ctx.reply(msg);
});

bot.hears('⭐ Feedback', async (ctx) => {
    await ctx.reply(
        '📝 Send your feedback:\n\n' +
        'Type: /feedback Your feedback here\n\n' +
        'Example: /feedback Bot is very helpful!'
    );
});

// ========================================
// ১৩. ফিডব্যাক কমান্ড
// ========================================

bot.command('feedback', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userInfo = ctx.from;
        const feedbackText = ctx.message.text.replace('/feedback', '').trim();
        
        if (!feedbackText) {
            await ctx.reply(
                '❌ Please write your feedback.\n\n' +
                'Example: /feedback Bot is great!'
            );
            return;
        }
        
        const username = userInfo.username ? `@${userInfo.username}` : null;
        addFeedback(userId, feedbackText, username);
        
        await ctx.reply('✅ Thank you for your feedback! 🙏');
        
        const user = getUser(userId);
        const name = user?.display_name || 'Unknown';
        const adminMsg = `📝 New Feedback\n\n` +
            `👤 User: ${name}\n` +
            `🆔 ID: ${userId}\n` +
            `📝 Feedback: ${feedbackText}\n` +
            `📅 Time: ${formatBSTDate12h()}`;
        
        for (const adminId of ADMIN_IDS) {
            try {
                await ctx.telegram.sendMessage(adminId, adminMsg);
            } catch (error) {
                console.error('Admin notify error:', error);
            }
        }
        
    } catch (error) {
        console.error('Feedback error:', error);
        await ctx.reply('⚠️ Error saving feedback. Please try again.');
    }
});

// ========================================
// ১৪. সার্চ হ্যান্ডলার (Admin Notification সহ)
// ========================================

bot.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userInfo = ctx.from;
        const text = ctx.message.text.trim();

        // কুইক রিপ্লাই বাটন চেক
        if (['🔍 New Search', '📊 My Result', 'ℹ️ Help', '⭐ Feedback'].includes(text)) {
            return;
        }

        // কমান্ড চেক
        if (text.startsWith('/')) {
            return;
        }

        console.log(`🔍 Search: user=${userId}, roll=${text}`);

        if (!/^\d{6,7}$/.test(text)) {
            await ctx.reply(`❌ Invalid Roll Number!\n\nRoll number must be 6 or 7 digits.\nExample: 240363 or 2403631`);
            return;
        }

        const roll = text;

        let user = getUser(userId);
        if (user) {
            user.first_name = userInfo.first_name || '';
            user.last_name = userInfo.last_name || '';
            user.username = userInfo.username || '';
            user.display_name = getUserDisplayName(userInfo);
            updateUser(userId, user);
        }

        const waitingMsg = await ctx.reply(`⏳ Searching...\n🎯 Roll: ${roll}`);

        // সমান্তরালে ডেটা আনা
        const [studentResult, resultData] = await Promise.all([
            session.searchStudent(roll),
            session.getResult(roll)
        ]);

        let studentInfo = null;
        let studentFound = false;

        if (studentResult && studentResult.rows && studentResult.rows.length > 0) {
            studentInfo = studentResult.rows[0];
            studentFound = true;
        }

        user = getUser(userId) || { total_searches: 0 };
        user.total_searches = (user.total_searches || 0) + 1;
        user.joined = user.joined || getBSTTimestamp();
        updateUser(userId, user);

        const hasResult = resultData && resultData.success && resultData.data && resultData.data.length > 0;

        addHistory(userId, roll, studentFound || hasResult, studentInfo);

        await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

        let resultShown = false;

        // ১. স্টুডেন্ট ইনফরমেশন দেখান
        if (studentFound && studentInfo) {
            const studentReply = formatStudentData(studentInfo);
            const photoUrl = studentInfo.photoUrl;
            const photoFileId = studentInfo.photoFileId;
            
            const photoSent = await sendStudentPhoto(ctx, photoUrl, photoFileId, studentReply, roll, userId);
            
            if (!photoSent) {
                await ctx.reply(`📝 Information found (without photo)\n\n${studentReply}`);
            }
            resultShown = true;
        }

        // ২. রেজাল্ট দেখান
        if (hasResult) {
            const resultReply = formatResultData(resultData, roll);
            if (resultReply) {
                await ctx.reply(resultReply);
                resultShown = true;
            }
        }

        // ৩. কিছুই পাওয়া যায়নি
        if (!studentFound && !hasResult) {
            await ctx.reply(
                `❌ No information found!\n\nRoll: ${roll}\n\n🔍 Possible reasons:\n• Wrong roll number\n• Student not registered yet\n• Server issue`
            );
        }

        // ৪. সেভ রোল বাটন (যদি রেজাল্ট পাওয়া যায়)
        if (resultShown) {
            user.saved_roll = roll;
            updateUser(userId, user);
            
            const saveKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💾 Save This Roll', `save_${roll}`)],
                [Markup.button.callback('🔍 New Search', 'new_search')]
            ]);
            
            await ctx.reply(
                `💡 You can save this roll for quick access!\nRoll: ${roll}`,
                saveKeyboard
            );
        }

        // ৫. অ্যাডমিন নোটিফিকেশন পাঠান (প্রতিটি সার্চের জন্য)
        const currentTime = formatBSTDate12h();
        const userData = getUser(userId);
        await sendAdminNotification(ctx, userId, roll, studentFound || hasResult, currentTime, userData);

        // ৬. কুইক রিপ্লাই কীবোর্ড দেখান
        const keyboard = Markup.keyboard([
            ['🔍 New Search', '📊 My Result'],
            ['ℹ️ Help', '⭐ Feedback']
        ]).resize().oneTime();
        
        await ctx.reply('🔍 What would you like to do next?', keyboard);

    } catch (error) {
        console.error('Search error:', error);
        await ctx.reply('⚠️ Error processing your request. Please try again.');
    }
});

// ========================================
// ১৫. ইনলাইন কীবোর্ড ক্যালব্যাক হ্যান্ডলার
// ========================================

bot.action(/save_(.+)/, async (ctx) => {
    try {
        const roll = ctx.match[1];
        const userId = ctx.from.id;
        
        let user = getUser(userId);
        if (user) {
            user.saved_roll = roll;
            updateUser(userId, user);
            await ctx.answerCbQuery(`✅ Roll ${roll} saved!`);
            await ctx.reply(`✅ Roll ${roll} has been saved!\nUse "📊 My Result" to view it anytime.`);
        } else {
            await ctx.answerCbQuery('❌ User not found!');
        }
    } catch (error) {
        console.error('Save roll error:', error);
        await ctx.answerCbQuery('⚠️ Error saving roll!');
    }
});

bot.action('new_search', async (ctx) => {
    try {
        await ctx.answerCbQuery('🔍 Start a new search');
        await ctx.reply('📝 Please enter your roll number:');
    } catch (error) {
        console.error('New search error:', error);
        await ctx.answerCbQuery('⚠️ Error!');
    }
});

// ========================================
// ১৬. টেস্ট কমান্ড
// ========================================

bot.command('test', async (ctx) => {
    try {
        const testRoll = '240363';
        await ctx.reply(`🧪 Testing with roll: ${testRoll}`);
        
        const result = await session.searchStudent(testRoll);
        if (result && result.rows && result.rows.length > 0) {
            const student = result.rows[0];
            console.log('Test Student Data:', JSON.stringify(student, null, 2));
            const reply = formatStudentData(student);
            await ctx.reply(`✅ Test Result:\n\n${reply}`);
        } else {
            await ctx.reply('❌ No student found for test roll.');
        }
    } catch (error) {
        console.error('Test error:', error);
        await ctx.reply('⚠️ Test failed.');
    }
});

// ========================================
// ১৭. টাইম কমান্ড
// ========================================

bot.command('time', async (ctx) => {
    try {
        const currentTime = formatBSTDate12h();
        await ctx.reply(`🕐 Current BST Time:\n${currentTime}\n\n📅 Time Zone: BST (UTC+06:00)\n⏰ Format: 12-hour`);
    } catch (error) {
        console.error('Time command error:', error);
        await ctx.reply('⚠️ Error getting time.');
    }
});

// ========================================
// ১৮. এরর হ্যান্ডলার
// ========================================

bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    ctx.reply('⚠️ Server error! Please try again later.');
});

// ========================================
// ১৯. বট স্টার্ট এবং ওয়েব সার্ভার
// ========================================

console.log('🤖 Bot starting...');
console.log('👑 Admin IDs:', ADMIN_IDS);
console.log('🕐 Time Zone: BST (UTC+06:00) 12h Format');

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot is running! (BST Timezone - 12h Format)');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/time', (req, res) => {
    res.json({
        bst_12h: formatBSTDate12h(),
        bst_iso: getBSTTimestamp(),
        utc: new Date().toISOString()
    });
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
    console.log('✨ Features:');
    console.log('   • BST Timezone (UTC+6) - 12h Format');
    console.log('   • Admin Notification on every search (No Markdown)');
    console.log('   • Fixed duplicate username');
    console.log('   • All commands working');
    console.log('   • Quick Reply Buttons');
    console.log('   • Save Roll Feature');
    console.log('   • Feedback System');
    console.log('   • /time command to check current time');
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