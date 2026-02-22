const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DEALER_HITS_SOFT_17 = false;
const CARDS_PER_DECK = 52;
const BACKGROUND_TRACK_FILES = [
  "Casino Royal.wav",
  "Casino.wav",
  "Casino_Main.wav",
  "Poker Championship - Full.wav",
  "A Upbeat Funky Groovy (full version).wav",
  "Full V.wav",
  "Upbeat Happy Loop 1_29.wav",
  "Roll The Dice.mp3",
];
const WIN_SOUND_FILE = "win.mp3";
const WHALE_ALERT_SOUND_FILE = "whale_alert_fixed.mp3";
const WHALE_LEVEL_MULTIPLIER = 6;
const NEXT_HAND_DELAY_MS = 1000;
const CLEAR_TABLE_DELAY_MS = 200;
const ACTION_WORDS = { H: "Hit", S: "Stand", D: "Double", P: "Split", SU: "Surrender", FORCE_END: "Force End" };

// ---------- Card utilities ----------
function cardValue(rank) {
  if (rank === "A") return 11;
  if (["K", "Q", "J", "10"].includes(rank)) return 10;
  return Number(rank);
}

function hiLoValue(rank) {
  if (["2", "3", "4", "5", "6"].includes(rank)) return 1;
  if (["10", "J", "Q", "K", "A"].includes(rank)) return -1;
  return 0;
}

function evaluateHand(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = aces > 0; // any ace counted as 11
  const blackjack = cards.length === 2 && total === 21;
  return { total, soft, blackjack };
}

// ---------- Shoe ----------
class Shoe {
  constructor(decks = 6) {
    this.decks = decks;
    this.cards = [];
    this.runningCount = 0;
    this.shuffle();
  }

  shuffle() {
    this.cards = [];
    for (let d = 0; d < this.decks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({ rank, suit });
        }
      }
    }
    // Fisher-Yates
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.runningCount = 0;
  }

  draw() {
    if (this.cards.length === 0) this.shuffle();
    const card = this.cards.pop();
    this.runningCount += hiLoValue(card.rank);
    return card;
  }

  cardsLeft() {
    return this.cards.length;
  }

  trueCount() {
    const decksRemaining = Math.max(this.cards.length / CARDS_PER_DECK, 1);
    return this.runningCount / decksRemaining;
  }

  needsReshuffle() {
    return this.cards.length <= 100;
  }
}

// ---------- Strategy (basic) ----------
function baseStrategy(handInfo, dealerUp, opts) {
  const { total, soft } = handInfo;
  const { canSplit, canDouble, canSurrender, cards } = opts;
  const dealer = dealerUp;
  const pair =
    cards && cards.length === 2 && cardValue(cards[0].rank) === cardValue(cards[1].rank);

  if (canSurrender && !soft) {
    if (total === 16 && [9, 10, 11].includes(dealer)) return "SU";
    if (total === 15 && dealer === 10) return "SU";
  }

  if (canSplit && pair) {
    const rank = cards[0].rank;
    if (rank === "A") return "P";
    if (rank === "10" || ["J", "Q", "K"].includes(rank)) return "S";
    if (rank === "9") return [2, 3, 4, 5, 6, 8, 9].includes(dealer) ? "P" : "S";
    if (rank === "8") return "P";
    if (rank === "7") return dealer <= 7 ? "P" : "H";
    if (rank === "6") return dealer <= 6 ? "P" : "H";
    if (rank === "5") return canDouble && dealer <= 9 ? "D" : "H";
    if (rank === "4") return dealer === 5 || dealer === 6 ? "P" : "H";
    if (rank === "3" || rank === "2") return dealer <= 7 ? "P" : "H";
  }

  if (soft) {
    if (total <= 17) return canDouble && dealer >= 3 && dealer <= 6 ? "D" : "H";
    if (total === 18) {
      if (dealer >= 3 && dealer <= 6 && canDouble) return "D";
      if ([2, 7, 8].includes(dealer)) return "S";
      return "H";
    }
    return "S"; // soft 19+
  }

  // Hard totals
  if (total <= 8) return "H";
  if (total === 9) return canDouble && dealer >= 3 && dealer <= 6 ? "D" : "H";
  if (total === 10) return canDouble && dealer <= 9 ? "D" : "H";
  if (total === 11) return canDouble && dealer <= 10 ? "D" : "H";
  if (total === 12) return dealer >= 4 && dealer <= 6 ? "S" : "H";
  if (total >= 13 && total <= 16) return dealer <= 6 ? "S" : "H";
  return "S";
}

function applyCountDeviations(action, handInfo, dealerUp, trueCount, canDouble) {
  const { total, soft } = handInfo;
  if (soft) return action;
  // Illustrious-18-ish subset for Hi-Lo
  const tc = trueCount;
  const swaps = [
    { cond: total === 16 && dealerUp === 10, thr: 0, alt: "S", note: "16v10 stand at TC>=0" },
    { cond: total === 15 && dealerUp === 10, thr: 4, alt: "S", note: "15v10 stand at TC>=4" },
    { cond: total === 16 && dealerUp === 9, thr: 5, alt: "S", note: "16v9 stand at TC>=5" },
    { cond: total === 12 && dealerUp === 3, thr: 2, alt: "S", note: "12v3 stand at TC>=2" },
    { cond: total === 12 && dealerUp === 2, thr: 3, alt: "S", note: "12v2 stand at TC>=3" },
    { cond: total === 12 && dealerUp === 4, thr: 0, alt: "S", note: "12v4 stand at TC>=0" },
    { cond: total === 12 && dealerUp === 5, thr: -2, alt: "S", note: "12v5 stand at TC>=-2" },
    { cond: total === 12 && dealerUp === 6, thr: -1, alt: "S", note: "12v6 stand at TC>=-1" },
    { cond: total === 13 && dealerUp === 2, thr: -1, alt: "S", note: "13v2 stand at TC>=-1" },
    { cond: total === 13 && dealerUp === 3, thr: -2, alt: "S", note: "13v3 stand at TC>=-2" },
    { cond: total === 10 && dealerUp === 10, thr: 4, alt: "D", note: "10v10 double at TC>=4" },
    { cond: total === 10 && dealerUp === 11, thr: 4, alt: "D", note: "10vA double at TC>=4" },
    { cond: total === 11 && dealerUp === 11, thr: 1, alt: "D", note: "11vA double at TC>=1" },
    { cond: total === 9 && dealerUp === 2, thr: 1, alt: "D", note: "9v2 double at TC>=1" },
    { cond: total === 9 && dealerUp === 7, thr: 3, alt: "D", note: "9v7 double at TC>=3" },
  ];
  for (const rule of swaps) {
    if (rule.cond && tc >= rule.thr) {
      if (rule.alt === "D" && !canDouble) continue;
      return { action: rule.alt, note: rule.note };
    }
  }
  return { action, note: null };
}

function recommendedAction(hand, dealerUp, options, trueCount) {
  const base = baseStrategy(hand, dealerUp, options);
  const deviation = applyCountDeviations(base, hand, dealerUp, trueCount, options.canDouble);
  if (deviation.note) {
    return { action: deviation.action, reason: deviation.note };
  }
  return { action: base, reason: "Basic strategy chart" };
}

// ---------- Game State ----------
const state = {
  players: [],
  dealer: null,
  shoe: new Shoe(6),
  round: 0,
  simSpeed: 3,
  baseBet: 25,
  autoTimer: null,
  roundRunning: false,
  autoOn: false,
  logLines: [],
  fileLog: [],
  roundToken: 0,
  cumulativeProfit: 0,
  handsPlayed: 0,
  currentBetMultiplier: 1,
  gameMode: null, // "simulation" | "manual"
  manualBetUnits: 1,
  recommendedBetForRound: 0,
  awaitingBetSubmit: false,
  pendingBetSubmitToken: 0,
  pendingBetSubmitResolver: null,
  awaitingPlayerAction: false,
  pendingPlayerTurn: null,
  musicTrackIndex: 0,
  music: null,
  winSound: null,
  whaleAlertSound: null,
  whaleAlertFx: null,
};

function initBackgroundMusic() {
  if (state.music) return;
  setBackgroundTrack(state.musicTrackIndex, false);
}

function startBackgroundMusic() {
  if (!state.music) initBackgroundMusic();
  if (!state.music) return;
  const playPromise = state.music.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((e) => {
      log(`Music play blocked: ${e.message}`);
    });
  }
}

function stopBackgroundMusic() {
  if (!state.music) return;
  state.music.pause();
  state.music.currentTime = 0;
}

function setBackgroundTrack(index, autoplay) {
  const total = BACKGROUND_TRACK_FILES.length;
  if (!total) return;
  const normalized = ((index % total) + total) % total;
  const track = BACKGROUND_TRACK_FILES[normalized];
  try {
    const prior = state.music;
    if (prior) {
      prior.pause();
      prior.currentTime = 0;
    }
    const audio = new Audio(encodeURI(track));
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.6;
    state.music = audio;
    state.musicTrackIndex = normalized;
    if (autoplay) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((e) => log(`Music play blocked: ${e.message}`));
      }
    }
    log(`Track selected: ${track}`);
  } catch (e) {
    log(`Music track init failed: ${e.message}`);
  }
}

function nextBackgroundTrack() {
  const wasPlaying = Boolean(state.music && !state.music.paused);
  setBackgroundTrack(state.musicTrackIndex + 1, wasPlaying);
}

function initWinSound() {
  if (state.winSound) return;
  try {
    const audio = new Audio(encodeURI(WIN_SOUND_FILE));
    audio.preload = "auto";
    state.winSound = audio;
  } catch (e) {
    log(`Win sound init failed: ${e.message}`);
  }
}

function playWinSound() {
  if (!state.winSound) initWinSound();
  if (!state.winSound) return;
  // Clone allows re-triggering even if the prior playback has not fully ended.
  const fx = state.winSound.cloneNode();
  const playPromise = fx.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((e) => {
      log(`Win sound blocked: ${e.message}`);
    });
  }
}

function initWhaleAlertSound() {
  if (state.whaleAlertSound) return;
  try {
    const audio = new Audio(encodeURI(WHALE_ALERT_SOUND_FILE));
    audio.preload = "auto";
    audio.volume = 1;
    audio.onerror = () => {
      log(`Whale alert audio load error for ${WHALE_ALERT_SOUND_FILE}`);
    };
    state.whaleAlertSound = audio;
  } catch (e) {
    log(`Whale alert init failed: ${e.message}`);
  }
}

function playWhaleAlertSound() {
  return new Promise((resolve) => {
    const src = encodeURI(WHALE_ALERT_SOUND_FILE);
    const alert = new Audio(src);
    alert.preload = "auto";
    alert.volume = 1;
    state.whaleAlertFx = alert; // keep a live reference while it plays
    const priorMusicVolume = state.music ? state.music.volume : null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      hideWhaleOverlay();
      if (state.music && priorMusicVolume !== null) state.music.volume = priorMusicVolume;
      resolve();
    };
    showWhaleOverlay();
    if (state.music) state.music.volume = Math.min(0.25, state.music.volume);
    alert.onerror = () => {
      log(`Whale alert error (code ${alert.error ? alert.error.code : "unknown"})`);
      finish();
    };
    const playPromise = alert.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((e) => {
        log(`Whale alert blocked: ${e.message}`);
        finish();
      });
    }
    alert.onended = finish;
  });
}

function initPlayers(count) {
  state.players = [];
  const manualMode = state.gameMode === "manual";
  for (let i = 0; i < count; i++) {
    const isHuman = manualMode && i === 0;
    state.players.push({
      id: i,
      name: isHuman ? "Player 1 (You)" : `Bot ${manualMode ? i : i + 1}`,
      isHuman,
      bank: 10000,
      ledger: [],
      hands: [],
      activeHand: 0,
      done: false,
    });
  }
  state.dealer = { name: "Dealer", hand: [], holeRevealed: false };
}

function newShoe() {
  state.shoe.shuffle();
  state.round = 0;
  state.fileLog = [];
  log("New shoe shuffled.");
  renderCounts();
}

// ---------- Round flow ----------
function startRound() {
  if (state.roundRunning) return;
  state.roundRunning = true;
  clearAutoTimer();
  if (state.shoe.needsReshuffle()) {
    newShoe();
  }
  state.roundToken += 1;
  const thisRoundToken = state.roundToken;
  state.round += 1;
  // use freshly-updated count post-reshuffle (if any) before bets are set
  const tc = state.shoe.trueCount();
  state.currentBetMultiplier = betMultiplierForTC(tc);
  state.recommendedBetForRound = betForTC(tc, state.baseBet);
  renderCounts();
  let begun = false;
  const begin = async () => {
    if (begun) return;
    begun = true;
    dbg(`Round ${state.round} start; TC ${tc.toFixed(2)}; bet ramp ${betForTC(tc, state.baseBet)}`);
    if (state.gameMode === "manual") {
      logAdvice(`Recommended bet this hand: ${state.recommendedBetForRound} (${state.currentBetMultiplier}x) at TC ${tc.toFixed(1)}. Set your bet and press Submit Bet before cards are dealt.`);
      const accepted = await waitForManualBetSubmission(thisRoundToken);
      if (!accepted || thisRoundToken !== state.roundToken || !state.autoOn) {
        state.roundRunning = false;
        return;
      }
    }
    for (const p of state.players) {
      p.bankStart = p.bank;
      const handBet = (state.gameMode === "manual" && p.isHuman)
        ? currentManualBetAmount()
        : betForTC(tc, state.baseBet);
      p.hands = [
        { cards: [], bet: handBet, done: false, doubled: false, surrender: false, splitDepth: 0, actionCount: 0 },
      ];
      p.activeHand = 0;
      p.done = false;
      p.bank -= handBet; // initial wager
      p.currentRoundEntries = [{
        round: state.round,
        handId: `${p.id}-0`,
        bet: handBet,
        actions: [],
        result: null,
        net: null,
      }];
    }
    state.dealer.hand = [];
    state.dealer.holeRevealed = false;

    dealInitial();
    offerInsurance(tc);
    render();

    const dealerEval = evaluateHand(state.dealer.hand.map((c) => ({ ...c, hidden: false })));
    const { blackjackPlayers } = checkBlackjacks();
    if (dealerEval.blackjack) {
      dbg(`Immediate blackjack resolution. DealerBJ=${dealerEval.blackjack} playersBJ=${blackjackPlayers.length}`);
      settleHands(dealerEval);
      render();
      queueNextRound();
      return;
    }
    if (blackjackPlayers.length) {
      for (const p of blackjackPlayers) {
        if (p.hands[0]) p.hands[0].done = true;
      }
      log(`${blackjackPlayers.length} player blackjack(s) locked in; continuing remaining hands.`);
    }
    proceedTurns();
  };
  begin();
}

function offerInsurance(tc) {
  // Dealer upcard Ace only
  const up = state.dealer.hand.find((c) => !c.hidden) || state.dealer.hand[0];
  if (!up || up.rank !== "A") return;
  const takeInsurance = tc >= 3; // Hi-Lo threshold where insurance is +EV
  if (!takeInsurance) return;
  for (const p of state.players) {
    for (const hand of p.hands) {
      const ins = hand.bet / 2;
      hand.insuranceBet = ins;
      p.bank -= ins;
      appendActionToLedger(p, hand, "Insurance");
      log(`${p.name}: Took insurance ${ins} at TC ${tc.toFixed(1)}`);
    }
  }
}

function dealInitial() {
  // two rounds of cards
  for (let r = 0; r < 2; r++) {
    for (const p of state.players) {
      hitCard(p.hands[0]);
    }
    const card = state.shoe.draw();
    const hidden = r === 1;
    state.dealer.hand.push({ ...card, hidden });
  }
  renderCounts();
}

function hitCard(hand) {
  const card = state.shoe.draw();
  hand.cards.push(card);
}

function checkBlackjacks() {
  const dealerInfo = evaluateHand(
    state.dealer.hand.map((c) => ({ ...c, hidden: false }))
  );
  const dealerBJ = dealerInfo.blackjack;
  const blackjackPlayers = [];
  for (const p of state.players) {
    const info = evaluateHand(p.hands[0].cards);
    if (info.blackjack) blackjackPlayers.push(p);
  }
  return { blackjackPlayers, dealerBJ };
}

function proceedTurns() {
  const next = findNextHand();
  if (!next) {
    playDealer();
    return;
  }
  const { player, handIndex } = next;
  player.activeHand = handIndex;
  if (state.gameMode === "manual" && player.isHuman) {
    playerTurn(player, handIndex);
    return;
  }
  botPlay(player, handIndex);
}

function findNextHand() {
  for (const p of state.players) {
    for (let i = 0; i < p.hands.length; i++) {
      const h = p.hands[i];
      if (!h.done && evaluateHand(h.cards).total < 22 && !h.surrender) {
        return { player: p, handIndex: i };
      }
    }
  }
  return null;
}

function botPlay(player, handIndex) {
  const token = state.roundToken;
  const hand = player.hands[handIndex];
  const step = () => {
    if (token !== state.roundToken) return; // stale timer from previous round
    const handInfo = evaluateHand(hand.cards);
    const dealerUp = dealerUpValue();
    const rec = recommendedAction(handInfo, dealerUp, {
      canSplit: canSplit(hand),
      canDouble: canDouble(hand),
      canSurrender: hand.cards.length === 2 && (hand.actionCount || 0) === 0,
      cards: hand.cards,
    }, state.shoe.trueCount());
    logMove(player, hand, rec.action, rec.reason, handInfo, dealerUp, state.shoe.trueCount());
    appendActionToLedger(player, hand, rec.action);
    const res = handleAction(player, hand, rec.action);
    dbg(`Action ${rec.action} for ${player.name} handTotal=${handInfo.total} dealerUp=${dealerUp} result=${res || 'cont'}`);
    if (res === "SPLIT" || res === "FORCE_END") {
      render();
      proceedTurns();
      return;
    }
    render();
    const info = evaluateHand(hand.cards);
    if (hand.done || info.total >= 21) {
      proceedTurns();
    } else {
      setTimeout(step, speedDelay());
    }
  };
  setTimeout(step, speedDelay());
}

function playerTurn(player, handIndex) {
  const token = state.roundToken;
  const hand = player.hands[handIndex];
  if (!hand) return;
  const handInfo = evaluateHand(hand.cards);
  const dealerUp = dealerUpValue();
  const rec = recommendedAction(handInfo, dealerUp, {
    canSplit: canSplit(hand),
    canDouble: canDouble(hand),
    canSurrender: hand.cards.length === 2 && (hand.actionCount || 0) === 0,
    cards: hand.cards,
  }, state.shoe.trueCount());

  state.awaitingPlayerAction = true;
  state.pendingPlayerTurn = { token, playerId: player.id, handIndex };
  updatePlayerActionButtons(hand, true);
  logAdvice(`Optimal move: ${ACTION_WORDS[rec.action] || rec.action}. ${rec.reason}`);
  render();
}

function onPlayerAction(action) {
  if (!state.awaitingPlayerAction || !state.pendingPlayerTurn) return;
  const pending = state.pendingPlayerTurn;
  if (pending.token !== state.roundToken) {
    state.awaitingPlayerAction = false;
    state.pendingPlayerTurn = null;
    updatePlayerActionButtons(null, false);
    return;
  }
  const player = state.players.find((p) => p.id === pending.playerId);
  if (!player) return;
  const hand = player.hands[pending.handIndex];
  if (!hand || hand.done) return;

  const canSurrenderNow = hand.cards.length === 2 && (hand.actionCount || 0) === 0;
  if (action === "D" && !canDouble(hand)) return;
  if (action === "P" && !canSplit(hand)) return;
  if (action === "SU" && !canSurrenderNow) return;

  const handInfo = evaluateHand(hand.cards);
  const dealerUp = dealerUpValue();
  logMove(player, hand, action, "Manual player choice", handInfo, dealerUp, state.shoe.trueCount());
  appendActionToLedger(player, hand, action);
  const res = handleAction(player, hand, action);
  state.awaitingPlayerAction = false;
  state.pendingPlayerTurn = null;
  updatePlayerActionButtons(null, false);
  render();

  if (res === "SPLIT" || res === "FORCE_END") {
    proceedTurns();
    return;
  }
  const info = evaluateHand(hand.cards);
  if (hand.done || info.total >= 21) {
    proceedTurns();
  } else {
    playerTurn(player, pending.handIndex);
  }
}

function dealerUpValue() {
  const up = state.dealer.hand.find((c) => !c.hidden) || state.dealer.hand[0];
  return cardValue(up.rank);
}

function canSplit(hand) {
  if (hand.cards.length !== 2) return false;
  if ((hand.splitDepth ?? 0) >= 3) return false; // cap at 4 hands
  const v1 = cardValue(hand.cards[0].rank);
  const v2 = cardValue(hand.cards[1].rank);
  return v1 === v2;
}

function canDouble(hand) {
  return hand.cards.length === 2;
}

function handleAction(player, hand, action) {
  const info = evaluateHand(hand.cards);
  if (hand.done) return;
  const priorActions = hand.actionCount || 0;
  hand.actionCount = priorActions + 1;
  if (action === "SU" && (priorActions > 0 || hand.cards.length !== 2)) {
    action = "H"; // surrender only allowed as first decision
  }
  if (hand.actionCount > 15 || hand.cards.length > 8) {
    hand.done = true;
    return "FORCE_END";
  }
  switch (action) {
    case "H":
      hitCard(hand);
      if (evaluateHand(hand.cards).total >= 21) hand.done = true;
      return;
    case "S":
      hand.done = true;
      return;
    case "D":
      if (canDouble(hand)) {
        // double requires matching the current bet
        player.bank -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hitCard(hand);
        appendActionToLedger(player, hand, "Double");
      }
      hand.done = true;
      return;
    case "P":
      if (!canSplit(hand)) break;
      const [c1, c2] = hand.cards;
      const depth = (hand.splitDepth ?? 0) + 1;
      // pay additional bet for the second hand
      player.bank -= hand.bet;
      const newHand1 = { cards: [c1], bet: hand.bet, done: false, doubled: false, surrender: false, splitDepth: depth, actionCount: 0 };
      const newHand2 = { cards: [c2], bet: hand.bet, done: false, doubled: false, surrender: false, splitDepth: depth, actionCount: 0 };
      hitCard(newHand1);
      hitCard(newHand2);
      player.hands.splice(player.hands.indexOf(hand), 1, newHand1, newHand2);
      appendSplitToLedger(player, hand, newHand1, newHand2);
      return "SPLIT";
    case "SU":
      hand.surrender = true;
      hand.done = true;
      appendActionToLedger(player, hand, "Surrender");
      return;
    default:
      hand.done = true;
  }
}

function playDealer() {
  state.dealer.holeRevealed = true;
  let info = evaluateHand(state.dealer.hand.map((c) => ({ ...c, hidden: false })));
  const hitsSoft17 = DEALER_HITS_SOFT_17;
  const step = () => {
    if (
      info.total < 17 ||
      (info.total === 17 && info.soft && hitsSoft17)
    ) {
      const card = state.shoe.draw();
      state.dealer.hand.push({ ...card, hidden: false });
      info = evaluateHand(state.dealer.hand.map((c) => ({ ...c, hidden: false })));
      render();
      setTimeout(step, 300);
    } else {
      dbg(`Dealer stands/busts with ${info.total}${info.soft ? ' soft' : ''}`);
      setTimeout(() => {
        try {
          settleHands(info); // pass full dealer info (bust handled inside)
          render();
          queueNextRound();
        } catch (e) {
          log(`ERROR settling hands: ${e.message}`);
          state.roundRunning = false;
        }
      }, 1000);
    }
  };
  render();
  setTimeout(step, 300);
}

function settleHands(dealerInfo) {
  const dealerTotal = dealerInfo ? dealerInfo.total : 0;
  const dealerBJ = dealerInfo ? dealerInfo.blackjack : false;
  let roundProfit = 0;
  for (const p of state.players) {
    for (const hand of p.hands) {
      const info = evaluateHand(hand.cards);
      let payout = 0; // amount returned to player after the initial bet was already removed
      if (hand.surrender) {
        payout = hand.bet / 2;
        hand.outcomeLabel = "SURRENDER";
      } else if (info.blackjack && !dealerBJ) {
        payout = hand.bet * 2.5;
        hand.outcomeLabel = "WIN";
      } else if (info.blackjack && dealerBJ) {
        payout = hand.bet; // push
        hand.outcomeLabel = "PUSH";
      } else if (info.total > 21) {
        payout = 0;
        hand.outcomeLabel = "BUST";
      } else if (dealerBJ && !info.blackjack) {
        payout = 0;
        hand.outcomeLabel = "LOSE";
      } else if (dealerInfo && dealerTotal > 21) {
        payout = hand.bet * 2;
        hand.outcomeLabel = "WIN";
      } else if (dealerInfo) {
        if (info.total > dealerTotal) {
          payout = hand.bet * 2;
          hand.outcomeLabel = "WIN";
        } else if (info.total < dealerTotal) {
          payout = 0;
          hand.outcomeLabel = "LOSE";
        } else {
          payout = hand.bet;
          hand.outcomeLabel = "PUSH";
        }
      } else {
        payout = hand.bet * 2;
        hand.outcomeLabel = "WIN";
      }
      p.bank += payout;
      let net = payout - hand.bet; // since bet was already subtracted at start
      hand.result = net;
      // insurance resolution
      let insuranceNet = 0;
      if (hand.insuranceBet) {
        if (dealerBJ) {
          const pay = hand.insuranceBet * 3; // returns stake + 2:1
          p.bank += pay;
          insuranceNet = pay - hand.insuranceBet;
        } else {
          insuranceNet = -hand.insuranceBet;
        }
      }
      net += insuranceNet;
      hand.result = net;
      roundProfit += net;
      hand.done = true;
      finalizeLedgerHand(p, hand, net, hand.outcomeLabel);
    }
    p.done = true;
  }
  dbg(`Round ${state.round} settled. Dealer ${dealerTotal}${dealerInfo && dealerInfo.soft ? ' soft' : ''}. Round profit ${roundProfit.toFixed(2)}.`);
  if (roundProfit > 0) {
    playWinSound();
  }
  state.cumulativeProfit += roundProfit;
  verifyAccounting(roundProfit);
  renderCounts();
  state.roundRunning = false;
  state.handsPlayed += 1;
}

function verifyAccounting(roundProfit) {
  let deltaBanks = 0;
  for (const p of state.players) {
    if (p.bankStart === undefined) continue;
    deltaBanks += (p.bank - p.bankStart);
  }
  const epsilon = 0.05; // allow tiny floating/insurance rounding noise
  if (Math.abs(deltaBanks - roundProfit) > epsilon) {
    log(`ACCOUNTING WARNING: bank delta ${deltaBanks.toFixed(2)} != tracked round ${roundProfit.toFixed(2)}. Continuing for now.`);
  }
}

// ---------- Ledger helpers ----------
function appendActionToLedger(player, hand, action) {
  const entry = findLedgerEntry(player, hand);
  if (!entry) return;
  entry.actions.push(action);
}

function appendSplitToLedger(player, hand, handA, handB) {
  // mark original entry as split and create two child entries
  const entry = findLedgerEntry(player, hand);
  if (!entry) return;
  entry.actions.push("Split");
  const baseBet = hand.bet;
  entry.result = "SPLIT_PARENT";
  entry.net = 0;
  const makeChild = (handObj, idx) => ({
    round: state.round,
    handId: `${player.id}-${handObj.splitDepth}-${idx}-${Date.now()}`,
    bet: baseBet,
    actions: ["Auto-rebet from split"],
    result: null,
    net: null,
  });
  if (!player.currentRoundEntries) player.currentRoundEntries = [];
  player.currentRoundEntries.push(makeChild(handA, 0));
  player.currentRoundEntries.push(makeChild(handB, 1));
}

function finalizeLedgerHand(player, hand, net, label) {
  const entry = findLedgerEntry(player, hand);
  if (!entry) return;
  entry.result = label;
  entry.net = net;
  if (hand.insuranceBet) {
    entry.insurance = hand.insuranceBet;
  }
  // move to persistent ledger
  player.ledger.push(entry);
}

function findLedgerEntry(player, hand) {
  if (!player.currentRoundEntries) return null;
  // try to match by reference stored on hand
  if (!hand.ledgerId) {
    hand.ledgerId = `${player.id}-${hand.splitDepth || 0}-${Math.random().toString(36).slice(2,8)}-${Date.now()}`;
    // attach to first available entry without result
  }
  let entry = player.currentRoundEntries.find(e => e.handId === hand.ledgerId);
  if (!entry) {
    entry = player.currentRoundEntries.find(e => e.result === null);
    if (entry) entry.handId = hand.ledgerId;
  }
  return entry;
}

// ---------- Simulation loop ----------
function clearTableCards() {
  for (const p of state.players) {
    p.hands = [];
    p.activeHand = 0;
    p.done = false;
  }
  state.dealer.hand = [];
  state.dealer.holeRevealed = false;
  render();
}

function upcomingBetMultiplier() {
  if (state.shoe.needsReshuffle()) return 1;
  return betMultiplierForTC(state.shoe.trueCount());
}

function queueNextRound() {
  if (!state.autoOn) return;
  clearAutoTimer();
  const token = state.roundToken;
  state.autoTimer = setTimeout(() => {
    if (!state.autoOn || token !== state.roundToken || state.roundRunning) return;
    const nextMultiplier = upcomingBetMultiplier();
    state.currentBetMultiplier = nextMultiplier;
    renderCounts();
    clearTableCards();

    state.autoTimer = setTimeout(async () => {
      if (!state.autoOn || token !== state.roundToken || state.roundRunning) return;
      if (nextMultiplier >= WHALE_LEVEL_MULTIPLIER) {
        await playWhaleAlertSound();
      }
      if (!state.autoOn || token !== state.roundToken || state.roundRunning) return;
      startRound();
    }, CLEAR_TABLE_DELAY_MS);
  }, NEXT_HAND_DELAY_MS);
}

function speedDelay() {
  switch (Number(state.simSpeed)) {
    case 1: return 1000;
    case 2: return 650;
    case 3: return 350;
    case 4: return 150;
    case 5: return 50;
    default: return 400;
  }
}

function clearAutoTimer() {
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
}

function stopAuto() {
  clearAutoTimer();
  state.autoOn = false;
  state.roundRunning = false;
  resolveManualBetSubmission(false);
  state.awaitingPlayerAction = false;
  state.pendingPlayerTurn = null;
  updatePlayerActionButtons(null, false);
  state.roundToken += 1; // invalidate pending bot timers
  stopBackgroundMusic();
}

// ---------- UI ----------
const elements = {
  app: document.getElementById("app"),
  mainMenu: document.getElementById("main-menu"),
  modeSimBtn: document.getElementById("mode-sim-btn"),
  modeManualBtn: document.getElementById("mode-manual-btn"),
  modeLabel: document.getElementById("game-mode-label"),
  simSpeed: document.getElementById("sim-speed"),
  baseBet: document.getElementById("base-bet"),
  autoBtn: document.getElementById("auto-btn"),
  stopBtn: document.getElementById("stop-btn"),
  changeMusicBtn: document.getElementById("change-music-btn"),
  saveLogBtn: document.getElementById("save-log-btn"),
  playerActions: document.getElementById("player-actions"),
  betMinusBtn: document.getElementById("bet-minus-btn"),
  betPlusBtn: document.getElementById("bet-plus-btn"),
  manualBetDisplay: document.getElementById("manual-bet-display"),
  submitBetBtn: document.getElementById("submit-bet-btn"),
  actHitBtn: document.getElementById("act-hit-btn"),
  actStandBtn: document.getElementById("act-stand-btn"),
  actDoubleBtn: document.getElementById("act-double-btn"),
  actSplitBtn: document.getElementById("act-split-btn"),
  actSurrenderBtn: document.getElementById("act-surrender-btn"),
  table: document.getElementById("table"),
  running: document.getElementById("running-count"),
  trueCount: document.getElementById("true-count"),
  betMultiplier: document.getElementById("bet-multiplier"),
  cardsLeft: document.getElementById("cards-left"),
  shoeInfo: document.getElementById("shoe-info"),
  roundNumber: document.getElementById("round-number"),
  profitTotal: document.getElementById("profit-total"),
  handsPlayed: document.getElementById("hands-played"),
  log: document.getElementById("log"),
  whaleOverlay: document.getElementById("whale-overlay"),
  whaleImage: document.getElementById("whale-image"),
};

function showWhaleOverlay() {
  if (!elements.whaleOverlay) return;
  elements.whaleOverlay.hidden = false;
  if (elements.whaleImage) {
    elements.whaleImage.classList.remove("animate");
    // force restart for repeated triggers
    void elements.whaleImage.offsetWidth;
    elements.whaleImage.classList.add("animate");
  }
  elements.whaleOverlay.classList.add("active");
}

function hideWhaleOverlay() {
  if (!elements.whaleOverlay) return;
  elements.whaleOverlay.classList.remove("active");
  if (elements.whaleImage) elements.whaleImage.classList.remove("animate");
  setTimeout(() => {
    if (!elements.whaleOverlay.classList.contains("active")) {
      elements.whaleOverlay.hidden = true;
    }
  }, 260);
}

function updatePlayerActionButtons(hand, enabled) {
  if (!elements.playerActions) return;
  if (state.gameMode !== "manual") {
    elements.playerActions.classList.add("hidden");
    return;
  }
  elements.playerActions.classList.remove("hidden");
  const disableAll = !enabled || !hand;
  elements.actHitBtn.disabled = disableAll;
  elements.actStandBtn.disabled = disableAll;
  elements.actDoubleBtn.disabled = disableAll || !canDouble(hand);
  elements.actSplitBtn.disabled = disableAll || !canSplit(hand);
  elements.actSurrenderBtn.disabled = disableAll || !(hand.cards.length === 2 && (hand.actionCount || 0) === 0);
}

function currentManualBetAmount() {
  const units = Math.max(1, Number(state.manualBetUnits) || 1);
  return state.baseBet * units;
}

function updateManualBetDisplay() {
  if (!elements.manualBetDisplay) return;
  elements.manualBetDisplay.textContent = `Bet: ${currentManualBetAmount()}`;
}

function updateManualBetControls() {
  const manualMode = state.gameMode === "manual";
  const canSubmit = manualMode && state.awaitingBetSubmit;
  if (elements.betMinusBtn) elements.betMinusBtn.disabled = !manualMode;
  if (elements.betPlusBtn) elements.betPlusBtn.disabled = !manualMode;
  if (elements.submitBetBtn) elements.submitBetBtn.disabled = !canSubmit;
}

function waitForManualBetSubmission(token) {
  if (state.gameMode !== "manual") return Promise.resolve(true);
  state.awaitingBetSubmit = true;
  state.pendingBetSubmitToken = token;
  updateManualBetControls();
  return new Promise((resolve) => {
    state.pendingBetSubmitResolver = resolve;
  });
}

function resolveManualBetSubmission(accepted) {
  if (!state.pendingBetSubmitResolver) return;
  const resolver = state.pendingBetSubmitResolver;
  state.pendingBetSubmitResolver = null;
  state.awaitingBetSubmit = false;
  updateManualBetControls();
  resolver(Boolean(accepted));
}

function adjustManualBetUnits(delta) {
  if (state.gameMode !== "manual") return;
  const nextUnits = Math.max(1, (Number(state.manualBetUnits) || 1) + delta);
  state.manualBetUnits = nextUnits;
  updateManualBetDisplay();
  logAdvice(`Manual bet set to ${currentManualBetAmount()}.`);
}

function startMode(mode) {
  state.gameMode = mode;
  stopAuto();
  hideWhaleOverlay();
  resolveManualBetSubmission(false);
  state.awaitingPlayerAction = false;
  state.pendingPlayerTurn = null;
  updatePlayerActionButtons(null, false);
  state.shoe = new Shoe(6);
  state.round = 0;
  state.cumulativeProfit = 0;
  state.handsPlayed = 0;
  state.currentBetMultiplier = 1;
  state.manualBetUnits = 1;
  state.logLines = [];
  state.fileLog = [];
  elements.mainMenu.classList.add("hidden");
  elements.app.classList.remove("hidden");
  elements.modeLabel.textContent = `Mode: ${mode === "manual" ? "Manual Play" : "Simulation"}`;
  initPlayers(5);
  render();
  updateManualBetDisplay();
  updateManualBetControls();
  log(`Ready. ${mode === "manual" ? "Manual Play" : "Simulation"} selected.`);
}

function renderCounts() {
  elements.cardsLeft.textContent = `Cards left: ${state.shoe.cardsLeft()}`;
  elements.running.textContent = `Running: ${state.shoe.runningCount}`;
  elements.trueCount.textContent = `True: ${state.shoe.trueCount().toFixed(1)}`;
  elements.betMultiplier.textContent = `Bet Multiplier: ${state.currentBetMultiplier}x`;
  elements.betMultiplier.classList.remove("win");
  if (state.currentBetMultiplier > 1) elements.betMultiplier.classList.add("win");
  elements.roundNumber.textContent = `Round: ${state.round}`;
  elements.profitTotal.textContent = `Profit: ${state.cumulativeProfit.toFixed(0)}`;
  elements.profitTotal.classList.remove("win", "lose");
  if (state.cumulativeProfit > 0) elements.profitTotal.classList.add("win");
  if (state.cumulativeProfit < 0) elements.profitTotal.classList.add("lose");
  elements.handsPlayed.textContent = `Hands: ${state.handsPlayed}`;
}

function betMultiplierForTC(tc) {
  if (tc >= 3) return 6;
  if (tc >= 2) return 4;
  if (tc >= 1) return 2;
  return 1;
}

function betForTC(tc, unit) {
  return unit * betMultiplierForTC(tc);
}

function render() {
  renderCounts();
  const frag = document.createDocumentFragment();

  // Dealer in first seat of the main table
  const dealerSeat = document.createElement("div");
  dealerSeat.className = "seat dealer";
  dealerSeat.innerHTML = `<div class="name">Dealer</div>`;
  const dealerHand = document.createElement("div");
  dealerHand.className = "hand";
  state.dealer.hand.forEach((c) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    if (c.hidden && !state.dealer.holeRevealed) {
      cardEl.style.backgroundImage = `url(${cardBackImage()})`;
    } else {
      cardEl.style.backgroundImage = `url(${cardImage(c, false)})`;
    }
    dealerHand.appendChild(cardEl);
  });
  dealerSeat.appendChild(dealerHand);
  const dealerInfo = evaluateHand(
    state.dealer.hand.map((c) => ({ ...c, hidden: false }))
  );
  const dealerText = state.dealer.holeRevealed
    ? `Total: ${dealerInfo.total}${dealerInfo.soft ? " (soft)" : ""}${dealerInfo.total > 21 ? " - BUST" : ""}`
    : "Up card shown";
  dealerSeat.appendChild(createTotalTag(dealerText, dealerInfo.total > 21));
  frag.appendChild(dealerSeat);

  // Players
  for (const p of state.players) {
    const seat = document.createElement("div");
    seat.className = "seat";

    const settled = !state.roundRunning && p.hands.length > 0 && p.hands.every((h) => typeof h.result === "number");
    if (settled) {
      const playerNet = p.hands.reduce((sum, h) => sum + h.result, 0);
      if (playerNet > 0) seat.classList.add("seat-result-win");
      else if (playerNet < 0) seat.classList.add("seat-result-lose");
      else seat.classList.add("seat-result-push");
    }

    seat.innerHTML = `
      <div class="name">${p.name}</div>
      <div class="bank">Bank: ${p.bank.toFixed(0)}</div>
    `;
    p.hands.forEach((hand, idx) => {
      const info = evaluateHand(hand.cards);
      const handDiv = document.createElement("div");
      handDiv.className = "hand";
      hand.cards.forEach((c) => {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.style.backgroundImage = `url(${cardImage(c, false)})`;
        handDiv.appendChild(cardEl);
      });
      const total = document.createElement("div");
      total.className = "total";
      const totalPrefix = document.createElement("span");
      totalPrefix.textContent = `Total: ${info.total}${info.soft ? " (soft)" : ""} | `;
      const betSpan = document.createElement("span");
      betSpan.textContent = `Bet ${hand.bet}`;
      if (hand.bet > state.baseBet) betSpan.classList.add("bet-boost");
      total.appendChild(totalPrefix);
      total.appendChild(betSpan);
      if (hand.outcomeLabel) {
        const res = document.createElement("span");
        res.className = "status-tag";
        res.textContent = hand.outcomeLabel;
        if (hand.outcomeLabel === "WIN") res.classList.add("win");
        if (hand.outcomeLabel === "LOSE" || hand.outcomeLabel === "BUST") res.classList.add("lose");
        total.appendChild(res);
      }
      if (hand.result !== undefined) {
        const res = document.createElement("span");
        res.className = "status-tag";
        res.textContent = hand.result > 0 ? `+${hand.result}` : `${hand.result}`;
        if (hand.result > 0) res.classList.add("win");
        if (hand.result < 0) res.classList.add("lose");
        total.appendChild(res);
      } else if (hand.surrender) {
        const res = document.createElement("span");
        res.className = "status-tag";
        res.textContent = "Surrender";
        res.classList.add("surrender");
        total.appendChild(res);
      }
      seat.appendChild(handDiv);
      seat.appendChild(total);
    });
    frag.appendChild(seat);
  }

  elements.table.innerHTML = "";
  elements.table.appendChild(frag);
}

function createTotalTag(text, isBust = false) {
  const div = document.createElement("div");
  div.className = "total";
  div.textContent = text;
  if (isBust) {
    const bust = document.createElement("span");
    bust.className = "status-tag lose";
    bust.textContent = "BUST";
    div.appendChild(bust);
  }
  return div;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function appendLogEntry(htmlBody, plainBody) {
  state.logLines.unshift(`[${new Date().toLocaleTimeString()}] ${htmlBody}`);
  state.logLines = state.logLines.slice(0, 80);
  elements.log.innerHTML = state.logLines.join("<br>");
  elements.log.scrollTop = 0;
  state.fileLog.push(`[${new Date().toISOString()}] ${plainBody}`);
  if (state.fileLog.length > 1000) state.fileLog.shift();
}

function log(msg) {
  appendLogEntry(escapeHtml(msg), msg);
}

function logAdvice(msg) {
  appendLogEntry(`<span class="log-advice">${escapeHtml(msg)}</span>`, `ADVICE: ${msg}`);
}

function dbg(msg) {
  log(`DBG: ${msg}`);
}

// Capture runtime errors into the on-screen log for debugging
window.onerror = function (message, source, lineno, colno, error) {
  log(`ERROR: ${message} @${lineno}:${colno} ${error ? error.stack : ""}`);
};

function logMove(player, hand, action, reason, handInfo, dealerUp, trueCount) {
  const cardText = hand.cards.map((c) => c.rank + c.suit).join(" ");
  const msg = `${player.name}: ${ACTION_WORDS[action] || action} (hand ${cardText} = ${handInfo.total}${handInfo.soft ? 's' : ''}, dealer ${dealerUp}) via ${reason}; RC ${state.shoe.runningCount}, TC ${trueCount.toFixed(1)}.`;
  log(msg);
}

function cardImage(card, hidden) {
  if (hidden) return cardBackImage();
  const rankMap = { "A": "A", "J": "J", "Q": "Q", "K": "K", "10": "0", "9": "9", "8": "8", "7": "7", "6": "6", "5": "5", "4": "4", "3": "3", "2": "2" };
  const suitMap = { "S": "S", "H": "H", "D": "D", "C": "C" };
  const r = rankMap[card.rank] || card.rank;
  const s = suitMap[card.suit] || card.suit;
  return `https://deckofcardsapi.com/static/img/${r}${s}.png`;
}

function cardBackImage() {
  return "https://deckofcardsapi.com/static/img/back.png";
}

// ---------- Event bindings ----------
elements.modeSimBtn.addEventListener("click", () => startMode("simulation"));
elements.modeManualBtn.addEventListener("click", () => startMode("manual"));

elements.simSpeed.addEventListener("change", (e) => {
  state.simSpeed = Number(e.target.value);
});

elements.baseBet.addEventListener("change", (e) => {
  state.baseBet = Math.max(25, Number(e.target.value));
  e.target.value = state.baseBet;
  updateManualBetDisplay();
});

elements.autoBtn.addEventListener("click", () => {
  if (!state.gameMode) return;
  state.autoOn = true;
  initWinSound();
  initWhaleAlertSound();
  startBackgroundMusic();
  startRound();
});

elements.changeMusicBtn.addEventListener("click", () => {
  nextBackgroundTrack();
});

elements.actHitBtn.addEventListener("click", () => onPlayerAction("H"));
elements.actStandBtn.addEventListener("click", () => onPlayerAction("S"));
elements.actDoubleBtn.addEventListener("click", () => onPlayerAction("D"));
elements.actSplitBtn.addEventListener("click", () => onPlayerAction("P"));
elements.actSurrenderBtn.addEventListener("click", () => onPlayerAction("SU"));
elements.betMinusBtn.addEventListener("click", () => adjustManualBetUnits(-1));
elements.betPlusBtn.addEventListener("click", () => adjustManualBetUnits(1));
elements.submitBetBtn.addEventListener("click", () => {
  if (!state.awaitingBetSubmit) return;
  if (state.pendingBetSubmitToken !== state.roundToken) {
    resolveManualBetSubmission(false);
    return;
  }
  log(`Player 1 submitted bet ${currentManualBetAmount()}.`);
  resolveManualBetSubmission(true);
});

elements.stopBtn.addEventListener("click", stopAuto);
elements.saveLogBtn.addEventListener("click", () => {
  const blob = new Blob([state.fileLog.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blackjack-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Init ----------
elements.app.classList.add("hidden");
elements.mainMenu.classList.remove("hidden");
updatePlayerActionButtons(null, false);
updateManualBetControls();


