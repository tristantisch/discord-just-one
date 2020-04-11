const {Client, MessageEmbed} = require('discord.js');
const bot = new Client();


const token = 'Njk3ODE4NTM0OTA1OTA1MjAy.Xo80Qg.zuio21dthutvBQZPvuPsj-bCOXY';

const PREFIX = '!';

//TODO Make sure that GameState always has all fields!!


bot.on('ready', () => {
	console.log('This bot is online.');
});
 
bot.on('message', handleMessage);

bot.login(token);


const fs = require('fs');
var channel;
const GameState = {
	STOPPED: 0,
	LOBBY: 	1,
	PLAYING: 2,
	WRITING: 3,
	DUPLICATES: 4,
	CHOOSING: 5,
	PENDING: 6
}
Object.freeze(GameState);

var Game = {
	'state': GameState.STOPPED, 
	'players': [],
	'numCards': 13,
	'round': 0
};

const embed = new MessageEmbed().setColor(0xe6dcc1);

//Handles a message of any type
function handleMessage(message) {
	if(message.channel.type === 'dm') {
			handleDMCommand(message)
	} else if (message.content.charAt(0) === PREFIX) {	
		channel = message.channel;
		//Split the message into command and args
		var args = message.content.substring(PREFIX.length).split(' ');
		if (args.length > 0) {
			handleCommand(message, args);
		} else {
			printNoCommandFound();
		}
	}
}

//Handles a message in a DM Channel
function handleDMCommand(message) {
	//We only continue if the message is not from us and the player exists
	if(!(message.author.id === bot.user.id) && playerExists((player) => {return player.user.id === message.author.id})) {
		switch(Game.state) {
			case GameState.WRITING:
				handleWriting(message);
				break;
			case GameState.DUPLICATES:
				handleDuplicates(message);
				break;
			default:
				message.channel.send(embed.setTitle('').setDescription('Gerade brauche ich keine Eingabe von dir. Lehne dich zurück :)'));
		}
	} else if (!(message.author.id === bot.user.id)){
		message.channel.send(embed.setTitle('').setDescription('Du bist in keinem Spiel.'));	
	}
}

//Handles a message if it is a command (starts with the prefix)
function handleCommand(message, args) {
	let command = args[0];
	switch (command) {
		case 'help': 
			printHelpMessage();
			break;
		case 'start':
			startGame();
			break;
		case 'stop':
			stopGame();
			break;
		case 'join':
			joinGame(message.author);
			break;
		case 'play':
			playGame();
			break;
		case 'guess':
			handleGuess(message, args);
			break;
		case 'solved':
			handlePending(true);
			break;
		case 'failed':
			handlePending(false);
			break;
		default:
			printNoCommandFound();
	}
}

//Sets up a new Game and starts with the lobby phase
function startGame() {
	if (Game.state === GameState.STOPPED) {
		Game = {
			'state': GameState.LOBBY,
			'players': [],
			'numCards': 13,
			'round': 0
		};
		
		channel.send(embed.setTitle('Spiel gestartet').setDescription("Neues Spiel gestarted. **!join** um beizutreten, **!play** um zu spielen."));
	} else {
		channel.send(embed.setTitle('Spiel läuft noch.').setDescription('Ein Spiel läuft gerade noch. Beende dieses zuerst mit **!stop**, um ein neues Spiel zu starten zu können.'));
	}
}

//Stops a game if one is running
function stopGame() {
	if(Game.state === GameState.STOPPED) {
		channel.send(embed.setTitle('').setDescription("Es läuft momentan kein Spiel. Starte doch eins mit !start."));
	} else {
		Game.state = GameState.STOPPED;
		channel.send(embed.setTitle("Spiel beendet.").setDescription('Tschüss. Bis zum nächten Mal.'));
	}
}

//Lets a user join the game if it is in lobby phase
function joinGame(user) {
	if (Game.state === GameState.LOBBY) {
		if(playerExists((usr) => {return usr.user === user;})) {
			channel.send(embed.setTitle('').setDescription("Du bist bereits im Spiel."));
		} else {
			Game.players.push({
								'user': user,
								'hintGiven': false});
			const dmChannelPromise = user.createDM();
			dmChannelPromise.then(ch => {ch.send(embed.setTitle('Wilkommen zu Just One').setDescription(''))});
			channel.send(embed.setTitle('').setDescription(mentionUser(user.id) + ' ist nun im Spiel!'));
		}
	} else if (Game.state === GameState.STOPPED) {
		channel.send(embed.setTitle('').setDescription('Es läuft kein Spiel, dem du beitreten kannst. Erstelle eines mit **!start**.'))
	}
}

//Really starts the game
function playGame() {
	if(Game.state === GameState.LOBBY && Game.players.length > 1) {
		Game.state = GameState.PLAYING;
		fs.readFile('./words.txt', 'utf8', (err, data) => {
			if (err) {
				console.error(err)
				return
			}
		let words = data.split(/\r?\n/g);

		//select numCards cards and save them in the game Object
		var cards = [];
		for(var i = 0; i < Game.numCards; i++) {
			let rand = Math.floor(Math.random() * words.length); //yields a random number between 0 and words.length-1 (inclusive)
			cards.push(words[rand]);
			words.splice(rand, 1);
		}
		//Set up the three card piles
		Game.cardsYetPlayed = [...cards];
		Game.cardsSolved = [];
		Game.cardsFailed = [];
		//The first player to join is the one chosing first
		Game.activePlayer = 0;
		})
		channel.send(embed.setTitle('Spiel gestarted').setDescription('Los geht\'s!')).then(playRound);
	} else if (Game.state === GameState.LOBBY) {
		channel.send(embed.setTitle('Zu wenig Spieler').setDescription('Es müssen mindestens zwei Spieler mitspielen.'));
	} else {
		channel.send(embed.setTitle('').setDescription('Du kannst nur eine neue Runde spielen, wenn kein Spiel am Laufen ist und ein neues Spiel gestartet wurde.'));
	}
}

//Play one round
function playRound() {

	if(Game.cardsYetPlayed.length == 0) {
		endGame();
		return;
	}

	//Setup the round
	Game.activePlayer = (Game.activePlayer + 1) % Game.players.length;
	for(let j = 0; j < Game.players.length; j++) {
		Game.players[j].hintGiven = false;
		Game.players[j].hintInvalid = false;
	}
	Game.players[Game.activePlayer].hintGiven = true;
	Game.state = GameState.WRITING;
	Game.round++;
	Game.activeCard = Game.cardsYetPlayed.pop();
	channel.send(embed.setTitle('Runde ' + Game.round).setDescription(''));

	for(var i = 0; i < Game.players.length; i++) {
		if(Game.activePlayer == i) {
			Game.players[i].user.dmChannel.send(embed.setTitle('').setDescription('Du bist der aktive Spieler. Die Tipps werde im Channel ' + 
											mentionChannel(channel) + 'bekanntgegeben.'));
		} else {
			Game.players[i].user.dmChannel.send(embed.setTitle('Runde ' + Game.round).setDescription('Der Begriff lautet: **' + Game.activeCard + '**\n' + 
											'Gib hier deinen Tipp ab.'));
		}
	}
}

//Handles input during the hint writing phase
function handleWriting(message) {
	let p = retreivePlayer(message.author.id);
	if(Game.players[Game.activePlayer] === p) {
	} else {
		p.hintGiven = true;
		p.hint = message.content;
		message.channel.send(embed.setTitle('Tipp abgegeben').setDescription('Dein Tipp ist ' + message.content + '. Wenn alle Ihre Tipps abgegeben haben, kannst du hier doppelte Begriffe aussortieren.'));
	}
	checkIfHintsOver();
}

//Calls selectDuplicates if all hints are given
function checkIfHintsOver() {
	//if a player exists that has not yet given his hint, do nothing
	if(playerExists((player) => {return !player.hintGiven})) {
		
	} else {
		selectDuplicates();
	}
}

//Handles the start of the duplicate phase
function selectDuplicates() {
	Game.state = GameState.DUPLICATES;
	for(var i = 0; i < Game.players.length; i++) {
		if(i != Game.activePlayer) {
			printHints(Game.players[i].user.dmChannel);
			Game.players[i].user.dmChannel.send(embed.setTitle('').setDescription('Schreibe eine Zahl, um diesen Tipp auszuschließen. Schreibe **passt** um fortzufahren.'));
		}
	}
}

//Handles input during the duplicate choosing phase
function handleDuplicates(message) {
	//The active player should not be able to choose the duplicates (or see them anyways)
	if(message.author == Game.players[Game.activePlayer].user) {
	} else {
		if(message.content === 'passt') {
			Game.state = GameState.CHOOSING;
			for(var i = 0; i < Game.players.length; i++) {
				Game.players[i].user.dmChannel.send(embed.setTitle('').setDescription('Die Hinweise wurden bestätigt. Geht zu ' + mentionChannel(channel) + '!'));
			}
			printHints(channel);
			channel.send(embed.setTitle('').setDescription(mentionUser(Game.players[Game.activePlayer].user.id) + 'Gib deinen Tipp mit **!guess** ***<Dein Tipp>*** ab? Wenn du die Karte überspringen möchtest, schreibe **!guess skip**'));
			return;
		}
		var number = parseInt(message.content);
		//Test if the number matches one of the hints
		if(isNaN(number) || number >= Game.players.length || number === Game.activePlayer) {
			message.reply('Bitte wähle eine der oben genannten Zahlen aus.');
			return;
		}
		Game.players[number].hintInvalid = true;
		printHints(message.channel);
		message.channel.send(embed.setTitle('').setDescription('Schreibe eine Zahl, um diesen Tipp auszuschließen. Schreibe **passt** um fortzufahren.'));
	}
}

//Handles Command $guess
function handleGuess(message, args) {
	if(Game.state != GameState.CHOOSING) {
		channel.send(embed.setTitle('Whoops!').setDescription('Der Command ist gerade nicht möglich. Checke **!help**'));
		return;
	}

	//If anyone but the active player wants to guess, this is not permitted
	if(message.author != Game.players[Game.activePlayer].user) {
		channel.send(embed.setTitle('').setDescription('Nur ' + mentionUser(Game.players[Game.activePlayer].user.id) + ' kann einen Tipp abgeben.'));
		return;
	}

	//If there was no guess
	if(args.length == 1) {
		channel.send(embed.setTitle('Wo ist dein Tipp?').setDescription('Bitte gebe einen Tipp der Form **!guess** *<Dein Tipp>* ab'));
		return;
	}

	if(args[1] === 'skip') {
		Game.cardsFailed.push(Game.activeCard);
		channel.send(embed.setTitle('Skiperino!').setDescription('Karte geskipped, die Lösung wäre **' + Game.activeCard + '** gewesen.'));
		printStats();
		playRound();
		return;
	}

	if(args[1] === Game.activeCard) {
		channel.send(embed.setTitle('Hurra!').setDescription('Das ist das richtige Wort!'));
		Game.cardsSolved.push(Game.activePlayer);
		printStats();
		playRound();
		return;
	}

	channel.send(embed.setTitle('Nope (glaube ich)').setDescription('Argh, die richtige Lösung war leider **' + Game.activeCard + '**.\n' + 
				'Findet ihr, dass der Tipp trotzdem zählen sollte? Dann schreibt **!solved**, ansonsten **!failed**'));
	Game.state = GameState.PENDING;
}

//Handles Commands $solved and $failed
function handlePending(solved) {
	if(Game.state != GameState.PENDING) {
		channel.send(embed.setTitle('What?').setDescription('Der Command ist gerade nicht möglich. Checke **!help**'));
		return;
	}

	if(solved) {
		channel.send(embed.setTitle('').setDescription('Alles klar ;)'));
		Game.cardsSolved.push(Game.activeCard);
		printStats();
		playRound();
		return;
	}

	channel.send(embed.setTitle('').setDescription('Schade Schokolade'));
	Game.cardsFailed.push(Game.activeCard);
	if(Game.cardsYetPlayed.length != 0) {
		Game.cardsFailed.push(Game.cardsYetPlayed.pop());
	}
	printStats();
	playRound();
}

function endGame() {
	channel.send(embed.setTitle('That\'s it! Game Over!').setDescription('Es war mir eine Ehre.'));
	//TODO fancy stats/sprüche
}




//Prints a message with all the commands
function printHelpMessage() {
	//TODO print custom help message based on game state
	let m = 'Es existieren die folgenden Commands: \n' + 
			'!start -> Startet ein neues Spiel \n' +
			'!stop -> Beendet das gerade laufende Spiel \n' +
			'!help -> Zeigt diese Hilfemitteilung \n' +
			'Du befindest dich im channel ' + mentionChannel(channel.id);
	channel.send(embed.setTitle('Hilfe!!').setDescription(m));
}

//Prints that the command was not found
function printNoCommandFound() {
	let m = 'Es gibt leider keinen solchen Command :/ \n' + 
			'Sende !help für alle Commands';
	channel.send(embed.setTitle('').setDescription(m));
}

//Prints all the hints given that are valid
function printHints(channel) {
	var m = '';
	for(var i = 0; i < Game.players.length; i++) {
		if(i != Game.activePlayer && Game.players[i].hintInvalid != true) {
			m += i + ' (' + Game.players[i].user.username + ') - ' + Game.players[i].hint + '\n';
		}
	}
	channel.send(embed.setTitle('Hier sind eure Hinweise').setDescription(m))
}

//Prints Stats about #cards played, solved and failed
function printStats() {
	channel.send(embed.setTitle('Zwischenstatistik').setDescription('Noch zu spielen: ' + Game.cardsYetPlayed.length + '\n' +
				'Richtig erraten: ' + Game.cardsSolved.length + '\n' + 
				'Falsch geraten/weggelegt: ' + Game.cardsFailed.length));
}

//returns a String with that mentions the channel
function mentionChannel(channelID) {
	return '<#' + channelID + '>';
}

//returns a String with that mentions the user
function mentionUser(userID) {
	return '<@' + userID + '>';
}

//Returns true iff the predicate callback applies to one of the players
function playerExists(callback) {
	var exists = false;
	for(var i = 0; i < Game.players.length; i++) {
		if(callback(Game.players[i])) {
			exists = true;
		}
	}
	return exists;
}

//Returns the player with the given user id, if there is no such player null
function retreivePlayer(id) {
	for(var i = 0; i < Game.players.length; i++) {
		if(Game.players[i].user.id === id) {
			return Game.players[i];
		}
	}
	return null;
}