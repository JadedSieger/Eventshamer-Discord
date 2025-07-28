require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// === CONFIG ===
const botName = "Yuura";
const persona = "Abrasive and very trigger-happy with insults but has a good side.";
const ACTIVITY_THRESHOLD_MINUTES = 30;

const genAI = new GoogleGenerativeAI(process.env.g_ApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers
  ]
});

// State
const activityTrackMap = new Map(); // key = userId + activityName -> timestamp
const roastedUsers = new Set(); // prevent repeat roasting

// On bot ready
client.once("ready", async () => {
  console.log(`🟢 Yuura online as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch(); // Make sure presences are available
  }
});

// On presence update
client.on("presenceUpdate", (oldPresence, newPresence) => {
  const user = newPresence.user;
  const activities = newPresence.activities || [];
  const now = Date.now();

  // If no activities, reset tracking and roast state
  if (activities.length === 0) {
    for (const key of activityTrackMap.keys()) {
      if (key.startsWith(user.id)) activityTrackMap.delete(key);
    }
    roastedUsers.delete(user.id);
    return;
  }

  let mergedActivities = [];
  let shouldRoast = false;
  let maxMinutes = 0;

  for (const activity of activities) {
    const key = `${user.id}-${activity.name}`;
    const existing = activityTrackMap.get(key);

    if (!existing) {
      activityTrackMap.set(key, now);
      console.log(`🎮 ${user.tag} started ${activity.name}`);
      continue;
    }

    const minutes = (now - existing) / 60000;
    if (minutes >= ACTIVITY_THRESHOLD_MINUTES) {
      mergedActivities.push(activity.name);
      maxMinutes = Math.max(maxMinutes, minutes);
      shouldRoast = true;
    }
  }

  if (shouldRoast && !roastedUsers.has(user.id) && mergedActivities.length > 0) {
    roastedUsers.add(user.id);
    const mergedString = mergedActivities.join(" and ");
    roastUser(user, mergedString, maxMinutes);
  }
});


// Gemini roast
async function roastUser(user, activityName, minutes) {
  const prompt = `You are "${botName}", an ${persona}.\n\nRoast a Discord user named "${user.username}" for doing "${activityName}" for ${minutes.toFixed(1)} minutes straight. Be creative, rude, sarcastic, and use dry humor like Greg House. Mix in Asuka Langley's attitude and Misato Katsuragi's tone. Do not use asterisks, emojis, or actions. Just pure verbal abuse with style.`;

  try {
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    // Try to find the guild(s) the user is in
    for (const [guildId, guild] of client.guilds.cache) {
      const member = guild.members.cache.get(user.id);
      if (!member) continue;

      // 🔰 1. Preferred channel by ID
      let targetChannel = guild.channels.cache.get("1236723037303214241");

      if (
        !targetChannel ||
        !targetChannel.isTextBased() ||
        !targetChannel.permissionsFor(guild.members.me).has("SendMessages")
      ) {
        // 🅱️ 2. Fallback: look for channel literally named "general"
        targetChannel = guild.channels.cache.find(c =>
          c.isTextBased() &&
          c.name.toLowerCase() === "general" &&
          c.permissionsFor(guild.members.me).has("SendMessages")
        );

        // 🆘 3. Fallback: any text channel the bot can send to
        if (!targetChannel) {
          targetChannel = guild.channels.cache.find(c =>
            c.isTextBased() &&
            c.permissionsFor(guild.members.me).has("SendMessages")
          );
        }
      }

      if (targetChannel) {
        await targetChannel.send({
          content: `${text}`
        });
        break; // Stop after first matching guild
      }
    }
  } catch (err) {
    console.error("❌ Gemini error:", err.message || err);
  }
}

setInterval(()=>{
  const now = Date.now();
  console.log(`[Activity Report - ${new Date().toLocaleTimeString()}]`);

  if(activityTrackMap.size === 0){
    console.log("No active users currently being monitored.");
    return;
  }

  for(const [key, startTime] of activityTrackMap.entries()){
    const [userId, activityName] = key.split("-");
    const minutes = ((now - startTime) / 60000).toFixed(1);
    console.log(`User ID: ${userId} - ${activityName} for ${minutes} min`);
  }
}, 5 * 60 * 1000);
client.login(process.env.DISCORD_BOT_TOKEN);
