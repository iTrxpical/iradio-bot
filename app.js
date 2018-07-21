const { RichEmbed, Client, Util } = require('discord.js');
const { prefix, GOOGLE_API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

var randomColor = Math.floor(Math.random() * 16777215).toString(16);

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Yo this ready!'));

client.on('disconnect', () => console.log('I just disconnected, making sure you know, I will reconnect now...'));

client.on('reconnecting', () => console.log('I am reconnecting now!'));

client.on('voiceStateUpdate', async (oldMember, newMember) => {
    let newUserChannel = newMember.voiceChannel;
    let oldUserChannel = oldMember.voiceChannel;
    var tchannel = client.channels.get('469209727688114198');
    var vchannel = client.channels.get('469209727688114200');
    var guild = client.guilds.get('469209727688114196');
    var role = guild.roles.find("name", "[-] Now Listening");
    if (oldUserChannel === undefined && newUserChannel !== undefined) {

        if (newUserChannel === vchannel) {
            tchannel.send(newMember.displayName + ' has joined the show and has recieved the `Now Listening` role!');
            await (newMember.addRole(role))

            console.log(`ADDED`)
        }
    } else if (newUserChannel === undefined) {
        tchannel.send(oldMember.displayName + ' has left the show and has now been removed from the `Now Listening` list!');
        await (newMember.removeRole(role))
    }
});

client.on("guildMemberAdd", function (member) {
    let role = member.guild.roles.find("name", "[-] Visitors");
    member.addRole(role).catch(console.error);
});

client.on('message', async msg => { // eslint-disable-line
    if (msg.author.bot) return undefined;
    if (!msg.content.startsWith(prefix)) return undefined;

    const args = msg.content.split(' ');
    const searchString = args.slice(1).join(' ');
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    const serverQueue = queue.get(msg.guild.id);

    let command = msg.content.toLowerCase().split(' ')[0];
    command = command.slice(prefix.length)

    if (command === 'info') {
        msg.channel.send(`WIP`);
    } else if (msg.channel.id !== '469886232495915028') {
        console.log(`Wrong Channel`);
        msg.channel.send('I am sorry but all music commands have to be in the `Control` channel.');
        return undefined;
    } else if (command === 'play') {
        const voiceChannel = msg.member.voiceChannel;
        if (!voiceChannel) return msg.channel.send('**Error 002** - Undefined channel resulting in unknown voice channel to broadcast in.');
        const permissions = voiceChannel.permissionsFor(msg.client.user);
        if (!permissions.has('CONNECT')) {
            return msg.channel.send('**Error 003** - Unsuitable permissions to connect into the show.');
        }
        if (!permissions.has('SPEAK')) {
            return msg.channel.send('**Error 003** - Unsuitable permissions to speak into the show.');
        }
        if (!args[1]) return msg.channel.send('**Error 005** - No search query entered.')

        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url);
            const videos = await playlist.getVideos();
            for (const video of Object.values(videos)) {
                const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
                await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
            }
            return msg.channel.send(`✅ Playlist: **${playlist.title}** has been added to the queue!`);
        } else {
            try {
                var video = await youtube.getVideo(url);
            } catch (error) {
                try {
                    var videos = await youtube.searchVideos(searchString, 10);
                    let index = 0;
                    msg.channel.send(`
__**Song selection:**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
Please provide a value to select one of the search results ranging from 1-10.
					`);
                    // eslint-disable-next-line max-depth
                    try {
                        var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                            maxMatches: 1,
                            time: 10000,
                            errors: ['time']
                        });
                    } catch (err) {
                        console.error(err);
                        return msg.channel.send('**Error 004** - Invalid value recongised or alternitavely the value was not entered.');
                    }
                    const videoIndex = parseInt(response.first().content);
                    var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
                } catch (err) {
                    console.error(err);
                    return msg.channel.send('**Error 004** - No search results found.');
                }
            }
            return handleVideo(video, msg, voiceChannel);
        }
    } else if (command === 'skip') {
        if (!msg.member.voiceChannel) return msg.channel.send('**Error 002** - Unable to skip when host is not in channel.');
        if (!serverQueue) return msg.channel.send('**Error 005** - No songs to be skipped in the queue.');
        serverQueue.connection.dispatcher.end('Skip command has been used!');
        return undefined;
    } else if (command === 'stop') {
        if (!msg.member.voiceChannel) return msg.channel.send('**Error 002** - Unable to stop when user is not in channel.');
        if (!serverQueue) return msg.channel.send('**Error 005** - No songs to be stopped in the queue.');
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end('Stop command has been used!');
        return undefined;
    } else if (command === 'volume') {
        if (!msg.member.voiceChannel) return msg.channel.send('**Error 002** - Unable to control when user is not in channel.');
        if (!serverQueue) return msg.channel.send('**Error 005** - No songs in the queue.');
        if (!args[1]) return msg.channel.send(`The current volume is: **${serverQueue.volume}**`);
        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
        return msg.channel.send(`I set the volume to: **${args[1]}**`);
    } else if (command === 'np') {
        if (!serverQueue) return msg.channel.send('**Error 005** - No songs in the queue.');
        return msg.channel.send(`🎶 Now playing: **${serverQueue.songs[0].title}**`);
    } else if (command === 'queue') {
        if (!serverQueue) return msg.channel.send('**Error 005** - No songs in the queue.');
        return msg.channel.send(`
__**Song queue:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Now playing:** ${serverQueue.songs[0].title}
		`);
    } else if (command === 'pause') {
        if (serverQueue && serverQueue.playing) {
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause();
            return msg.channel.send('⏸ Paused the music for you!');
        }
        return msg.channel.send('**Error 005** - No songs in the queue.');
    } else if (command === 'resume') {
        if (serverQueue && !serverQueue.playing) {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume();
            return msg.channel.send('▶ Resumed the music for you!');
        }
        return msg.channel.send('**Error 005** - No songs in the queue.');
    } else if (command === 'start') {
        var host = args[1];
        var sessionType = args[2];
        var times = args[3];
        var timef = args[4];

        var startEmbed = new RichEmbed()

            .setTitle("🎶 Show Starting 🎶")
            .setColor(`#${randomColor}`)
            .setFooter("iRadio • Show Notification")
            .setTimestamp()
            .setThumbnail('https://cdn.discordapp.com/attachments/469220356930928670/469935733407350784/playlogo.png')
            .addField('Host:', host)
            .addField('Type:', sessionType)
            .addField('Start:', times)
            .addField('End:', timef)

        var npChannel = client.channels.get('469856449003257876');

        npChannel.send(startEmbed);

        var guild = client.guilds.get('469209727688114196');

        var sChannel = client.channels.get('469209727688114200');

        sChannel.overwritePermissions(guild.id, {
            CONNECT: true
          })

    } else if (command === 'end') {

        var hoste = args[1];
        var sessionTypee = args[2];
        var timese = args[3];
        var timefe = args[4];

        var endEmbed = new RichEmbed()

            .setTitle("🎶 Show Ending 🎶")
            .setColor(`#${randomColor}`)
            .setFooter("iRadio • Show Notification")
            .setTimestamp()
            .setThumbnail('https://cdn.discordapp.com/attachments/469220356930928670/469935733407350784/playlogo.png')
            .addField('Host:', hoste)
            .addField('Type:', sessionTypee)
            .addField('Start:', timese)
            .addField('End:', timefe)

        var npChannel = client.channels.get('469856449003257876');

        npChannel.send(endEmbed);

        var guild = client.guilds.get('469209727688114196');

        var sChannel = client.channels.get('469209727688114200');

        sChannel.overwritePermissions(guild.id, {
            CONNECT: false
          })

    }

    return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
    const serverQueue = queue.get(msg.guild.id);
    console.log(video);
    const song = {
        id: video.id,
        title: Util.escapeMarkdown(video.title),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        durationm: video.duration.minutes,
        durations: video.duration.seconds
    };
    if (!serverQueue) {
        const queueConstruct = {
            textChannel: msg.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };
        queue.set(msg.guild.id, queueConstruct);

        queueConstruct.songs.push(song);

        try {
            var connection = await voiceChannel.join();
            queueConstruct.connection = connection;
            play(msg.guild, queueConstruct.songs[0]);
        } catch (error) {
            console.error(`I could not join the voice channel: ${error}`);
            queue.delete(msg.guild.id);
            return msg.channel.send(`I could not join the voice channel: ${error}`);
        }
    } else {
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        if (playlist) return undefined;
        else return msg.channel.send(`✅ **${song.title}** has been added to the queue!`);
    }
    return undefined;
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log(serverQueue.songs);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
        .on('end', reason => {
            if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
            else console.log(reason);
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on('error', error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

    serverQueue.textChannel.send(`🎶 Start playing: **${song.title}**`);

    var npChannel = client.channels.get('469856449003257876');

    var npEmbed = new RichEmbed()
        .setTitle("🎶 Now Playing 🎶")
        .setColor(`#${randomColor}`)
        .setFooter("iRadio • Show Notification")
        .setTimestamp()
        .setThumbnail('https://cdn.discordapp.com/attachments/469886232495915028/469911685478481930/logo2.png')
        .addField('Title:', song.title)
        .addField('Duration', `${song.durationm}:${song.durations}`)

    npChannel.send(npEmbed);
}

client.login(process.env.TOKEN);
