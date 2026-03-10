const STORAGE_KEY = "wordle-stats";
const SOUND_STORAGE_KEY = "wordle-sound-enabled";
const KEYBOARD_STORAGE_KEY = "wordle-keyboard-visible";
const REDUCED_MOTION_STORAGE_KEY = "wordle-reduced-motion";
const HIGH_CONTRAST_STORAGE_KEY = "wordle-high-contrast";
const LARGE_KEYBOARD_STORAGE_KEY = "wordle-large-keyboard";
const WORD_BANK = window.WORD_BANK ?? {};

const ROUND_FORMATS = [
  { length: 3, guesses: 5 },
  { length: 3, guesses: 6 },
  { length: 3, guesses: 7 },
  { length: 4, guesses: 4 },
  { length: 4, guesses: 5 },
  { length: 4, guesses: 6 },
  { length: 4, guesses: 7 },
  { length: 5, guesses: 5 },
  { length: 5, guesses: 6 },
  { length: 5, guesses: 7 },
  { length: 6, guesses: 4 },
  { length: 6, guesses: 5 },
  { length: 6, guesses: 6 },
  { length: 6, guesses: 7 },
  { length: 7, guesses: 5 },
  { length: 7, guesses: 6 },
  { length: 7, guesses: 7 }
];

const keyboardLayout = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"]
];

const boardElement = document.getElementById("board");
const boardPanelElement = document.querySelector(".board-panel");
const keyboardPanelElement = document.querySelector(".keyboard-panel");
const keyboardElement = document.getElementById("keyboard");
const fxLayer = document.getElementById("fx-layer");
const messageElement = document.getElementById("message");
const restartButton = document.getElementById("restart-button");
const helpButton = document.getElementById("help-button");
const settingsButton = document.getElementById("settings-button");
const helpModal = document.getElementById("help-modal");
const closeHelpButton = document.getElementById("close-help-button");
const settingsModal = document.getElementById("settings-modal");
const closeSettingsButton = document.getElementById("close-settings-button");
const howToTab = document.getElementById("how-to-tab");
const controlsTab = document.getElementById("controls-tab");
const helpTrack = document.getElementById("help-track");
const soundToggle = document.getElementById("sound-toggle");
const keyboardToggle = document.getElementById("keyboard-toggle");
const reducedMotionToggle = document.getElementById("reduced-motion-toggle");
const highContrastToggle = document.getElementById("high-contrast-toggle");
const largeKeyboardToggle = document.getElementById("large-keyboard-toggle");
const keyboardSettingItem = document.getElementById("keyboard-setting-item");
const hintButton = document.getElementById("hint-button");
const hintPanel = document.getElementById("hint-panel");
const hintText = document.getElementById("hint-text");
const hintTimer = document.getElementById("hint-timer");
const roundFormatElement = document.getElementById("round-format");

const statsElements = {
  played: document.getElementById("games-played"),
  won: document.getElementById("games-won"),
  streak: document.getElementById("current-streak"),
  best: document.getElementById("best-streak")
};

let stats = loadStats();
let secretWord = "";
let currentRow = 0;
let currentCol = 0;
let guesses = [];
let gameOver = false;
let isAnimating = false;
let roundConfig = ROUND_FORMATS[2];
let previousRoundKey = "";
let previousWord = "";
let resizeObserver;
let hintUsedThisRound = false;
let hintViewedThisOpen = false;
let soundEnabled = loadSoundPreference();
let keyboardVisible = loadKeyboardPreference();
let reducedMotion = loadBooleanPreference(REDUCED_MOTION_STORAGE_KEY, false);
let highContrast = loadBooleanPreference(HIGH_CONTRAST_STORAGE_KEY, false);
let largeKeyboard = loadBooleanPreference(LARGE_KEYBOARD_STORAGE_KEY, false);
let audioContext;
let autoAdvanceTimeout;
let autoSubmitTimeout;

function loadStats() {
  const defaults = { played: 0, won: 0, streak: 0, best: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function loadBooleanPreference(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function loadSoundPreference() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveSoundPreference() {
  localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabled));
}

function loadKeyboardPreference() {
  try {
    const raw = localStorage.getItem(KEYBOARD_STORAGE_KEY);
    return raw === null ? false : raw === "true";
  } catch {
    return false;
  }
}

function saveKeyboardPreference() {
  localStorage.setItem(KEYBOARD_STORAGE_KEY, String(keyboardVisible));
}

function saveBooleanPreference(key, value) {
  localStorage.setItem(key, String(value));
}

function updateStatsUI() {
  statsElements.played.textContent = stats.played;
  statsElements.won.textContent = stats.won;
  statsElements.streak.textContent = stats.streak;
  statsElements.best.textContent = stats.best;
}

function animateNumber(element, nextValue) {
  const currentValue = Number(element.textContent) || 0;
  if (currentValue === nextValue) {
    return;
  }

  const start = performance.now();
  const duration = 420;
  const step = (timestamp) => {
    const progress = Math.min(1, (timestamp - start) / duration);
    element.textContent = Math.round(currentValue + ((nextValue - currentValue) * progress));
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  element.parentElement?.classList.add("bump");
  window.setTimeout(() => element.parentElement?.classList.remove("bump"), 420);
  requestAnimationFrame(step);
}

function refreshStatsUI(animated = false) {
  const pairs = [
    [statsElements.played, stats.played],
    [statsElements.won, stats.won],
    [statsElements.streak, stats.streak],
    [statsElements.best, stats.best]
  ];

  pairs.forEach(([element, value]) => {
    if (animated) {
      animateNumber(element, value);
    } else {
      element.textContent = value;
    }
  });
}

function setMessage(text, type = "") {
  messageElement.textContent = text;
  messageElement.className = `message ${type}`.trim();
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function playTone(frequency, duration, type = "sine", volume = 0.03) {
  if (!soundEnabled) {
    return;
  }

  const context = ensureAudioContext();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gainNode.gain.value = volume;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  const now = context.currentTime;
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playChord(notes, duration, type = "sine", volume = 0.02) {
  notes.forEach((note, index) => {
    window.setTimeout(() => playTone(note, duration, type, volume), index * 70);
  });
}

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function applyKeyboardVisibility() {
  const hideDesktopKeyboard = !isTouchDevice() && !keyboardVisible;
  document.body.classList.toggle("keyboard-hidden", hideDesktopKeyboard);
}

function syncSettingsUI() {
  soundToggle.checked = soundEnabled;
  keyboardToggle.checked = keyboardVisible;
  reducedMotionToggle.checked = reducedMotion;
  highContrastToggle.checked = highContrast;
  largeKeyboardToggle.checked = largeKeyboard;
  keyboardSettingItem.hidden = isTouchDevice();
}

function queueNextRound(delay = 1800) {
  window.clearTimeout(autoAdvanceTimeout);
  autoAdvanceTimeout = window.setTimeout(() => {
    startGame();
    playChord([330, 440, 587], 0.16, "triangle", 0.018);
  }, delay);
}

function spawnParticles(target, type, count = 10) {
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = `particle ${type}`;
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 60}px`);
    particle.style.setProperty("--dy", `${(Math.random() - 0.5) * 60}px`);
    fxLayer.appendChild(particle);
    window.setTimeout(() => particle.remove(), 700);
  }
}

function spawnConfetti(target, count = 20) {
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const topY = rect.top + 20;
  const palette = ["#7dffb8", "#ffd166", "#c98fff", "#8be9ff"];

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = "particle confetti";
    particle.style.left = `${centerX + ((Math.random() - 0.5) * rect.width)}px`;
    particle.style.top = `${topY}px`;
    particle.style.background = palette[index % palette.length];
    particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 180}px`);
    particle.style.setProperty("--dy", `${70 + (Math.random() * 120)}px`);
    particle.style.transform = `rotate(${Math.random() * 360}deg)`;
    fxLayer.appendChild(particle);
    window.setTimeout(() => particle.remove(), 760);
  }
}

function createRipple(target) {
  target.classList.add("ripple-host");
  const ripple = document.createElement("span");
  ripple.className = "key-ripple";
  target.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 540);
}

function refreshRoundEffects() {
  boardElement.style.animation = "none";
  void boardElement.offsetWidth;
  boardElement.style.animation = "";
}

function updateA11yModes() {
  document.body.classList.toggle("reduced-motion", reducedMotion);
  document.body.classList.toggle("high-contrast", highContrast);
  document.body.classList.toggle("large-keyboard", largeKeyboard);
}

function setFinalGuessState(active) {
  document.querySelector(".game")?.classList.toggle("final-guess", active);
}

function randomFrom(list, exclude = "") {
  if (list.length === 1) {
    return list[0];
  }

  let choice = list[Math.floor(Math.random() * list.length)];
  while (choice === exclude) {
    choice = list[Math.floor(Math.random() * list.length)];
  }
  return choice;
}

function pickRoundConfig() {
  const options = ROUND_FORMATS.filter((config) => `${config.length}x${config.guesses}` !== previousRoundKey);
  const round = options[Math.floor(Math.random() * options.length)];
  previousRoundKey = `${round.length}x${round.guesses}`;
  return { length: round.length, guesses: round.guesses };
}

function pickSecretWord(length) {
  const words = WORD_BANK[length];
  const word = randomFrom(words, previousWord);
  previousWord = word;
  return word;
}

function updateRoundUI() {
  boardElement.style.setProperty("--board-cols", roundConfig.length);
  boardElement.style.setProperty("--board-rows", roundConfig.guesses);
  roundFormatElement.textContent = `${roundConfig.length}x${roundConfig.guesses}`;
  updateModeChipTheme();
  syncBoardScale();
  refreshRoundEffects();
}

function updateModeChipTheme() {
  const modeChip = roundFormatElement.closest(".mode-chip");
  if (!modeChip) {
    return;
  }

  const maxLength = 7;
  const minGuesses = 4;
  const maxGuesses = 7;
  const lengthWeight = (roundConfig.length - 3) / (maxLength - 3);
  const guessWeight = (maxGuesses - roundConfig.guesses) / (maxGuesses - minGuesses);
  const difficulty = Math.min(1, Math.max(0, (lengthWeight * 0.62) + (guessWeight * 0.38)));

  const easy = { r: 110, g: 234, b: 190 };
  const hard = { r: 198, g: 120, b: 255 };
  const r = Math.round(easy.r + ((hard.r - easy.r) * difficulty));
  const g = Math.round(easy.g + ((hard.g - easy.g) * difficulty));
  const b = Math.round(easy.b + ((hard.b - easy.b) * difficulty));

  modeChip.style.setProperty("--mode-color", `rgba(${r}, ${g}, ${b}, 0.92)`);
  modeChip.classList.remove("shift");
  void modeChip.offsetWidth;
  modeChip.classList.add("shift");
  window.setTimeout(() => modeChip.classList.remove("shift"), 440);
  modeChip.classList.toggle("pulsing", difficulty >= 0.62);
}

function syncBoardScale() {
  if (!boardPanelElement) {
    return;
  }

  const styles = window.getComputedStyle(boardElement);
  const panelStyles = window.getComputedStyle(boardPanelElement);
  const baseTile = parseFloat(styles.getPropertyValue("--tile-size"));
  const baseGap = parseFloat(styles.getPropertyValue("--tile-gap"));
  if (!baseTile || !baseGap) {
    return;
  }

  const panelPaddingX = parseFloat(panelStyles.paddingLeft) + parseFloat(panelStyles.paddingRight);
  const panelPaddingY = parseFloat(panelStyles.paddingTop) + parseFloat(panelStyles.paddingBottom);
  const statusHeight = boardPanelElement.querySelector(".status-row")?.offsetHeight ?? 0;
  const availableWidth = Math.max(0, boardPanelElement.clientWidth - panelPaddingX - 4);
  const availableHeight = Math.max(0, boardPanelElement.clientHeight - panelPaddingY - statusHeight - 8);
  if (!availableWidth || !availableHeight) {
    return;
  }

  const boardWidth = (roundConfig.length * baseTile) + ((roundConfig.length - 1) * baseGap);
  const boardHeight = (roundConfig.guesses * baseTile) + ((roundConfig.guesses - 1) * baseGap);
  const widthScale = (availableWidth + baseGap) / (boardWidth + baseGap);
  const heightScale = (availableHeight + baseGap) / (boardHeight + baseGap);
  const minScale = window.matchMedia("(pointer: coarse) and (max-width: 540px)").matches ? 0.56 : 0.72;
  const tileScale = Math.max(minScale, Math.min(widthScale, heightScale, 1.24));
  const gapScale = Math.max(0.72, Math.min(1.08, tileScale * 0.94));

  boardElement.style.setProperty("--round-tile-scale", `${tileScale}`);
  boardElement.style.setProperty("--round-gap-scale", `${gapScale}`);
}

function syncKeyboardScale() {
  if (!keyboardPanelElement) {
    return;
  }

  const panelStyles = window.getComputedStyle(keyboardPanelElement);
  const horizontalPadding = parseFloat(panelStyles.paddingLeft) + parseFloat(panelStyles.paddingRight);
  const availableWidth = keyboardPanelElement.clientWidth - horizontalPadding;
  const baseKey = 64;
  const baseHeight = 52;
  const isNarrowTouch = window.matchMedia("(pointer: coarse) and (max-width: 520px)").matches;
  const baseGap = isNarrowTouch ? 3.2 : 7.2;
  const wideMultiplier = isNarrowTouch ? 1.18 : 1.5;
  const keyboardBoost = largeKeyboard && isTouchDevice() ? 1.12 : 1;
  const largestRowWidth = Math.max(
    ...keyboardLayout.map((row) => {
      const units = row.reduce((sum, key) => sum + 1, 0);
      return (units * baseKey) + ((row.length - 1) * baseGap);
    })
  );

  if (!availableWidth || !largestRowWidth) {
    return;
  }

  const fittedScale = Math.min(1, availableWidth / largestRowWidth);
  const minKeyWidth = isNarrowTouch ? 32 : 30;
  const minKeyHeight = isNarrowTouch ? 34 : 28;
  const keyWidth = Math.max(minKeyWidth, baseKey * fittedScale * keyboardBoost);
  const keyHeight = Math.max(minKeyHeight, baseHeight * fittedScale * keyboardBoost);
  const keyGap = Math.max(isNarrowTouch ? 1.5 : 3, baseGap * fittedScale);
  const rowGap = Math.max(isNarrowTouch ? 2.5 : 3, 8.8 * fittedScale);
  const keyFontSize = Math.max(isNarrowTouch ? 14 : 14, 16 * fittedScale);

  keyboardElement.style.setProperty("--keyboard-key", `${keyWidth}px`);
  keyboardElement.style.setProperty("--key-height", `${keyHeight}px`);
  keyboardElement.style.setProperty("--keyboard-key-gap", `${keyGap}px`);
  keyboardElement.style.setProperty("--keyboard-row-gap", `${rowGap}px`);
  keyboardElement.style.setProperty("--key-font-size", `${keyFontSize}px`);
  keyboardElement.style.setProperty("--key-wide-multiplier", `${wideMultiplier}`);
}

function buildBoard() {
  boardElement.innerHTML = "";
  for (let row = 0; row < roundConfig.guesses; row += 1) {
    const rowElement = document.createElement("div");
    rowElement.className = "board-row";
    rowElement.dataset.row = row;
    if (row === currentRow) {
      rowElement.classList.add("current-row");
    }

    for (let col = 0; col < roundConfig.length; col += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = row;
      tile.dataset.col = col;
      rowElement.appendChild(tile);
    }

    boardElement.appendChild(rowElement);
  }
}

function buildKeyboard() {
  keyboardElement.innerHTML = "";
  keyboardLayout.forEach((row) => {
    const rowElement = document.createElement("div");
    rowElement.className = "keyboard-row";

    row.forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "key";
      button.dataset.key = key;
      button.textContent = key;
      button.addEventListener("click", () => {
        createRipple(button);
        playTone(320, 0.08, "triangle", 0.018);
        handleKeyPress(key);
      });
      rowElement.appendChild(button);
    });

    keyboardElement.appendChild(rowElement);
  });
}

function openHelpModal() {
  hintViewedThisOpen = false;
  setHelpTab("how-to");
  helpModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeHelpModal() {
  if (hintViewedThisOpen) {
    hintUsedThisRound = true;
  }
  helpModal.classList.add("hidden");
  hintPanel.classList.add("hidden");
  updateHintButtonState();
  if (settingsModal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

function openSettingsModal() {
  syncSettingsUI();
  settingsModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeSettingsModal() {
  settingsModal.classList.add("hidden");
  if (helpModal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

function setHelpTab(tab) {
  const showControls = tab === "controls";
  helpTrack.classList.toggle("show-controls", showControls);
  howToTab.classList.toggle("active", !showControls);
  controlsTab.classList.toggle("active", showControls);
  howToTab.setAttribute("aria-selected", String(!showControls));
  controlsTab.setAttribute("aria-selected", String(showControls));
}

function buildHint() {
  const firstLetter = secretWord[0];
  const uniqueLetters = new Set(secretWord.split(""));
  const vowels = secretWord.split("").filter((letter) => "AEIOU".includes(letter)).length;
  return `
    <div class="hint-list">
      <div class="hint-line">Starts with <span class="hint-accent">${firstLetter}</span></div>
      <div class="hint-line">Contains <span class="hint-accent">${uniqueLetters.size} unique</span></div>
      <div class="hint-line"><span class="hint-accent">${vowels} vowel${vowels === 1 ? "" : "s"}</span></div>
    </div>
  `;
}

function updateHintButtonState() {
  hintButton.classList.remove("available", "used");
  if (hintUsedThisRound) {
    hintButton.textContent = "Hint Used";
    hintButton.classList.add("used");
  } else {
    hintButton.textContent = "Hint";
    hintButton.classList.add("available");
  }
}

function showHint() {
  if (hintUsedThisRound) {
    return;
  }

  hintText.innerHTML = buildHint();
  hintPanel.classList.remove("hidden");
  hintTimer.textContent = "Ready";
  hintViewedThisOpen = true;
  playChord([440, 554, 659], 0.18, "triangle", 0.015);
}

function startGame() {
  window.clearTimeout(autoAdvanceTimeout);
  window.clearTimeout(autoSubmitTimeout);
  roundConfig = pickRoundConfig();
  secretWord = pickSecretWord(roundConfig.length);
  currentRow = 0;
  currentCol = 0;
  guesses = Array.from({ length: roundConfig.guesses }, () => Array(roundConfig.length).fill(""));
  gameOver = false;
  isAnimating = false;
  hintUsedThisRound = false;
  hintViewedThisOpen = false;
  hintPanel.classList.add("hidden");
  updateRoundUI();
  buildBoard();
  updateRowStateClasses();
  buildKeyboard();
  refreshStatsUI();
  updateHintButtonState();
  applyKeyboardVisibility();
  updateA11yModes();
  syncSettingsUI();
  setMessage(`New round: ${roundConfig.length} letters, ${roundConfig.guesses} tries.`);
  setFinalGuessState(false);
  requestAnimationFrame(syncBoardScale);
  requestAnimationFrame(syncKeyboardScale);
}

function getTile(row, col) {
  return boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function clearTileState(tile) {
  tile.classList.remove("correct", "present", "absent");
}

function setTileState(tile, state) {
  clearTileState(tile);
  if (state) {
    tile.classList.add(state);
  }
}

function writeTile(row, col, letter) {
  const tile = getTile(row, col);
  if (!tile) {
    return;
  }
  tile.textContent = letter;
  tile.classList.toggle("filled", Boolean(letter));
  if (letter) {
    tile.classList.add("sparkle");
    window.setTimeout(() => tile.classList.remove("sparkle"), 520);
    spawnParticles(tile, "type", 4);
    document.querySelector(".game")?.classList.add("input-active");
    window.setTimeout(() => document.querySelector(".game")?.classList.remove("input-active"), 220);
  } else {
    clearTileState(tile);
  }
}

function revealTypedLetter(row, col, letter, state) {
  const tile = getTile(row, col);
  if (!tile) {
    return;
  }

  if (tile._liveRevealStateTimer) {
    window.clearTimeout(tile._liveRevealStateTimer);
  }
  if (tile._liveRevealCleanupTimer) {
    window.clearTimeout(tile._liveRevealCleanupTimer);
  }
  tile.getAnimations().forEach((animation) => animation.cancel());
  clearTileState(tile);

  if (reducedMotion) {
    setTileState(tile, state);
    updateKeyState(letter, state);
    if (state === "correct" || state === "present") {
      spawnParticles(tile, state, state === "correct" ? 6 : 4);
    }
    return;
  }

  tile.animate(
    [
      { transform: "rotateX(0deg) scale(0.96)" },
      { transform: "rotateX(88deg) scale(1)", offset: 0.48 },
      { transform: "rotateX(0deg) scale(1)" }
    ],
    {
      duration: 460,
      easing: "cubic-bezier(0.32, 0.78, 0.18, 1)",
      fill: "none"
    }
  );

  tile._liveRevealStateTimer = window.setTimeout(() => {
    setTileState(tile, state);
    updateKeyState(letter, state);
    if (state === "correct" || state === "present") {
      spawnParticles(tile, state, state === "correct" ? 6 : 4);
    }
  }, 220);

  tile._liveRevealCleanupTimer = window.setTimeout(() => {
    tile.style.transform = "";
  }, 500);
}

function triggerRowReady(row) {
  const rowElement = boardElement.children[row];
  if (!rowElement) {
    return;
  }

  rowElement.classList.remove("ready-submit");
  void rowElement.offsetWidth;
  rowElement.classList.add("ready-submit");
  window.setTimeout(() => rowElement.classList.remove("ready-submit"), 430);
}

function handleKeyPress(key) {
  if (gameOver || isAnimating) {
    return;
  }

  if (!guesses[currentRow]) {
    return;
  }

  if (!/^[A-Z]$/.test(key) || currentCol >= roundConfig.length) {
    return;
  }

  guesses[currentRow][currentCol] = key;
  writeTile(currentRow, currentCol, key);
  const liveResult = scoreGuess(guesses[currentRow].map((letter) => letter || " ").join(""));
  revealTypedLetter(currentRow, currentCol, key, liveResult[currentCol]);
  currentCol += 1;
  if (currentCol === roundConfig.length) {
    triggerRowReady(currentRow);
    setMessage("Locked in...");
    window.clearTimeout(autoSubmitTimeout);
    autoSubmitTimeout = window.setTimeout(() => {
      void submitGuess();
    }, 360);
    return;
  }
  setMessage(`Guess ${currentRow + 1} of ${roundConfig.guesses}.`);
}

function updateRowStateClasses() {
  boardElement.querySelectorAll(".board-row").forEach((rowElement) => {
    const rowNumber = Number(rowElement.dataset.row);
    rowElement.classList.toggle("current-row", rowNumber === currentRow && !gameOver);
    rowElement.classList.toggle("settled", rowNumber < currentRow);
  });
}

function scoreGuess(guess) {
  const result = Array(roundConfig.length).fill("absent");
  const secretLetters = secretWord.split("");
  const used = Array(roundConfig.length).fill(false);

  for (let index = 0; index < roundConfig.length; index += 1) {
    if (guess[index] === secretLetters[index]) {
      result[index] = "correct";
      used[index] = true;
    }
  }

  for (let index = 0; index < roundConfig.length; index += 1) {
    if (result[index] === "correct") {
      continue;
    }

    const matchIndex = secretLetters.findIndex((letter, innerIndex) => letter === guess[index] && !used[innerIndex]);
    if (matchIndex !== -1) {
      result[index] = "present";
      used[matchIndex] = true;
    }
  }

  return result;
}

function updateKeyState(letter, state) {
  const key = keyboardElement.querySelector(`[data-key="${letter}"]`);
  if (!key) {
    return;
  }

  const precedence = { correct: 3, present: 2, absent: 1 };
  const currentState = ["correct", "present", "absent"].find((name) => key.classList.contains(name));
  if (currentState && precedence[currentState] > precedence[state]) {
    return;
  }

  key.classList.remove("correct", "present", "absent");
  key.classList.add(state);
}

function celebrateRow(row) {
  for (let index = 0; index < roundConfig.length; index += 1) {
    const tile = getTile(row, index);
    setTimeout(() => {
      tile.classList.add("pop");
      window.setTimeout(() => tile.classList.remove("pop"), 400);
    }, index * 90);
  }
}

function shakeCurrentRow() {
  for (let index = 0; index < roundConfig.length; index += 1) {
    const tile = getTile(currentRow, index);
    tile.classList.add("shake");
    window.setTimeout(() => tile.classList.remove("shake"), 360);
  }
}

async function submitGuess() {
  if (currentCol < roundConfig.length) {
    shakeCurrentRow();
    setMessage(`Guess must be ${roundConfig.length} letters.`, "error");
    return;
  }

  const guess = guesses[currentRow].join("");
  const result = scoreGuess(guess);
  const rowElement = boardElement.children[currentRow];
  rowElement?.classList.remove("ready-submit");
  rowElement?.classList.add("locking");
  playTone(260, 0.12, "square", 0.016);
  window.setTimeout(() => rowElement?.classList.remove("locking"), 220);

  result.forEach((state, index) => {
    const tile = getTile(currentRow, index);
    setTileState(tile, state);
    updateKeyState(guess[index], state);
    if (state === "correct") {
      playTone(620 + (index * 45), 0.12, "triangle", 0.012);
      spawnParticles(tile, state, 8);
    } else if (state === "present") {
      playTone(430 + (index * 25), 0.11, "sine", 0.01);
      spawnParticles(tile, state, 5);
    } else {
      playTone(220 + (index * 12), 0.08, "square", 0.008);
    }
  });

  if (guess === secretWord) {
    gameOver = true;
    stats.played += 1;
    stats.won += 1;
    stats.streak += 1;
    stats.best = Math.max(stats.best, stats.streak);
    saveStats();
    refreshStatsUI(true);
    celebrateRow(currentRow);
    boardElement.children[currentRow]?.classList.add("perfect");
    playChord([523, 659, 784, 1046], 0.22, "triangle", 0.02);
    result.forEach((state, index) => {
      if (state === "correct") {
        playTone(600 + (index * 70), 0.13, "triangle", 0.012);
      }
    });
    setMessage(`Solved ${roundConfig.length}x${roundConfig.guesses}: ${secretWord}`, "success");
    document.querySelectorAll(".background-orb").forEach((orb) => {
      orb.animate(
        [
          { opacity: 0.22, transform: "scale(1)" },
          { opacity: 0.48, transform: "scale(1.18)" },
          { opacity: 0.22, transform: "scale(1)" }
        ],
        { duration: 1200, easing: "ease-out" }
      );
    });
    const difficultyScore = roundConfig.length + (8 - roundConfig.guesses);
    if (difficultyScore >= 10) {
      spawnConfetti(boardElement, 26);
    }
    queueNextRound(2200);
    return;
  }

  currentRow += 1;
  currentCol = 0;
  updateRowStateClasses();

  if (currentRow === roundConfig.guesses) {
    gameOver = true;
    stats.played += 1;
    stats.streak = 0;
    saveStats();
    refreshStatsUI(true);
    playChord([220, 185, 146], 0.26, "sawtooth", 0.018);
    setMessage(`Out of turns. Word was ${secretWord}.`, "error");
    queueNextRound(2400);
    return;
  }

  setFinalGuessState(currentRow === roundConfig.guesses - 1);
  if (currentRow === roundConfig.guesses - 1) {
    playTone(180, 0.18, "square", 0.015);
  }
  setMessage(`${roundConfig.guesses - currentRow} guesses left.`);
}

function handlePhysicalKeyboard(event) {
  const { key } = event;
  const letter = key.toUpperCase();

  if (!/^[A-Z]$/.test(letter)) {
    if (key.length !== 1) {
      event.preventDefault();
    }
    return;
  }

  if (currentCol >= roundConfig.length || gameOver || isAnimating) {
    event.preventDefault();
    return;
  }

  playTone(320, 0.08, "triangle", 0.018);
  handleKeyPress(letter);
}

document.addEventListener("keydown", handlePhysicalKeyboard);
restartButton?.addEventListener("click", () => {
  startGame();
  playChord([330, 440, 587], 0.16, "triangle", 0.018);
});
helpButton?.addEventListener("click", openHelpModal);
howToTab?.addEventListener("click", () => setHelpTab("how-to"));
controlsTab?.addEventListener("click", () => setHelpTab("controls"));
settingsButton?.addEventListener("click", openSettingsModal);
soundToggle?.addEventListener("change", async () => {
  soundEnabled = soundToggle.checked;
  saveSoundPreference();
  if (soundEnabled) {
    await ensureAudioContext().resume();
    playChord([392, 494, 587], 0.16, "triangle", 0.018);
  }
  syncSettingsUI();
});
reducedMotionToggle?.addEventListener("change", () => {
  reducedMotion = reducedMotionToggle.checked;
  saveBooleanPreference(REDUCED_MOTION_STORAGE_KEY, reducedMotion);
  updateA11yModes();
  syncSettingsUI();
});
highContrastToggle?.addEventListener("change", () => {
  highContrast = highContrastToggle.checked;
  saveBooleanPreference(HIGH_CONTRAST_STORAGE_KEY, highContrast);
  updateA11yModes();
  syncSettingsUI();
});
largeKeyboardToggle?.addEventListener("change", () => {
  largeKeyboard = largeKeyboardToggle.checked;
  saveBooleanPreference(LARGE_KEYBOARD_STORAGE_KEY, largeKeyboard);
  updateA11yModes();
  syncKeyboardScale();
  syncSettingsUI();
});
closeHelpButton?.addEventListener("click", closeHelpModal);
closeSettingsButton?.addEventListener("click", closeSettingsModal);
keyboardToggle?.addEventListener("change", () => {
  keyboardVisible = keyboardToggle.checked;
  saveKeyboardPreference();
  applyKeyboardVisibility();
  syncKeyboardScale();
});
hintButton?.addEventListener("click", showHint);
helpModal?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
    closeHelpModal();
  }
});
settingsModal?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.closeSettings === "true") {
    closeSettingsModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeHelpModal();
    closeSettingsModal();
  }
});
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

resizeObserver = new ResizeObserver(() => {
  syncBoardScale();
  syncKeyboardScale();
});
resizeObserver.observe(boardElement);
if (keyboardPanelElement) {
  resizeObserver.observe(keyboardPanelElement);
}
window.addEventListener("resize", () => {
  syncBoardScale();
  syncKeyboardScale();
  applyKeyboardVisibility();
  syncSettingsUI();
});

startGame();
applyKeyboardVisibility();
updateA11yModes();
syncSettingsUI();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
