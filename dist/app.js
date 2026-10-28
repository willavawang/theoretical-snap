/* Milestone One: browser-local interactions and explicitly illustrative review data. */
"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, extra = "") => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LANES = ["Left", "Middle", "Right"];
const WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"];
const PRESETS = {
  midrange: {name:"Midrange", cards:[1,2,2,2,3,3,3,4,4,4,5,6], order:[2,3,4,1,6,2,3,3,4,2,4,5]},
  low: {name:"Low curve", cards:[1,1,1,1,2,2,2,2,3,3,4,5], order:[2,3,1,1,4,2,2,1,5,3,2,1]},
  balanced: {name:"Balanced", cards:[1,1,2,2,3,3,4,4,5,5,6,6], order:[2,3,4,1,6,2,3,5,4,1,5,6]},
};
const CARD_COLORS = {
  1:{ink:"#b2c8d5",border:"#536573",bg:"#202a33"},
  2:{ink:"#bdb6ce",border:"#605d73",bg:"#252531"},
  3:{ink:"#c7acb3",border:"#715862",bg:"#2c242d"},
  4:{ink:"#b2bdcd",border:"#596775",bg:"#222a35"},
  5:{ink:"#b3c9c7",border:"#536d70",bg:"#202b31"},
  6:{ink:"#d0c6b8",border:"#756e66",bg:"#2c2a2d"},
};

const state = {
  mode:"training", turn:6, deck:"midrange", opponent:"unknown", exercise:1,
  customDeck:[...PRESETS.midrange.cards], customOpponent:[...PRESETS.midrange.cards],
  plan:[], history:[], selected:null, reviewed:false, reviewTab:"overview", preview:null, showWhy:false, feedbackExample:"good",
  scenario:null, completed:new Set(), mobileSettings:false,
};
let toastTimer;
let pointerDrag = null;
let suppressClickUntil = 0;
let dialogReturnFocus = null;

function announce(message) { $("#live-status").textContent = message; }
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3200);
  announce(message);
}
function deckCards(which = "player") {
  const choice = which === "player" ? state.deck : state.opponent;
  if (choice === "custom") return which === "player" ? state.customDeck : state.customOpponent;
  return PRESETS[choice === "unknown" ? "midrange" : choice].cards;
}
function deckName(choice) { return choice === "unknown" ? "Unknown deck" : choice === "custom" ? "Custom" : PRESETS[choice].name; }
function cardById(id) { return state.scenario.hand.find((card) => card.id === id); }
function usedEnergy(plan = state.plan) { return plan.reduce((sum, item) => sum + (cardById(item.id)?.cost || 0), 0); }
function boardTotals(board) { return board.map((cards) => cards.reduce((sum, card) => sum + card.cost, 0)); }
function displayedPlan() { return state.preview === null ? state.plan : examplePlans()[state.preview]?.plan || state.plan; }

function makeScenario() {
  const rotation = (state.exercise - 1) % 3;
  function simulate(choice, opponent) {
    let values;
    if (choice === "custom") values = [...(opponent ? state.customOpponent : state.customDeck)];
    else if (opponent && choice === "unknown") values = [4,2,3,1,4,2,3,3,6,2,4,5];
    else values = [...PRESETS[choice].order];
    const cards = values.map((cost, index) => ({id:`${opponent ? "o" : "p"}-${index}`, cost}));
    const board = [[],[],[]];
    const hand = cards.slice(0,3);
    const preferredCost = opponent ? [0,0,2,3,4,4] : [0,0,2,3,4,3];
    const preferredLane = opponent ? [0,0,1,1,0,2] : [0,0,0,1,2,2];
    for (let turn=1; turn<=state.turn; turn++) {
      if (cards[turn+2]) hand.push(cards[turn+2]);
      if (turn === state.turn || turn === 1) continue;
      const cost = preferredCost[turn];
      const card = hand.find((item) => item.cost === cost) || [...hand].filter((item) => item.cost <= turn).sort((a,b)=>b.cost-a.cost)[0];
      if (!card) continue;
      const lane = (preferredLane[turn] + rotation) % 3;
      if (board[lane].length >= 4) continue;
      board[lane].push(card);
      hand.splice(hand.indexOf(card),1);
    }
    return {board,hand};
  }
  const player = simulate(state.deck,false);
  const opponent = simulate(state.opponent,true);
  return {player:player.board, opponent:opponent.board, hand:player.hand, custom:false};
}

function resetPosition({newScenario=true, message=""} = {}) {
  state.plan = [];
  state.history = [];
  state.selected = null;
  state.reviewed = false;
  state.reviewTab = "overview";
  state.showWhy = false;
  state.preview = null;
  if (newScenario) state.scenario = makeScenario();
  render();
  if (message) announce(message);
}

function saveHistory() { state.history.push(state.plan.map((item) => ({...item}))); }

function placeCard(id, lane) {
  if (state.reviewed) return toast("Retry the turn to change your play.");
  const card = cardById(id);
  if (!card || !Number.isInteger(lane) || lane < 0 || lane > 2) return;
  const previous = state.plan.find((item) => item.id === id);
  if (previous?.lane === lane) { state.selected=null; return render(); }
  const others = state.plan.filter((item) => item.id !== id);
  if (usedEnergy(others) + card.cost > state.turn) return toast(`This play needs ${card.cost} energy. You have ${state.turn-usedEnergy(others)} available.`);
  if (state.scenario.player[lane].length + others.filter((item) => item.lane === lane).length >= 4) return toast(`${LANES[lane]} lane has four cards already.`);
  saveHistory();
  state.plan = [...others,{id,lane}];
  state.selected=null;
  render();
  announce(`${card.cost}-energy card queued in ${LANES[lane].toLowerCase()} lane. ${state.turn-usedEnergy()} energy remaining.`);
}

function removeCard(id) {
  if (state.reviewed) return;
  if (!state.plan.some((item) => item.id === id)) return;
  saveHistory();
  state.plan=state.plan.filter((item) => item.id !== id);
  state.selected=null;
  render();
  announce("Card returned to your hand.");
}

function miniCard(card, player, pending=false, planned=false) {
  const tag=pending ? "button" : "span";
  const phase=state.preview!==null ? "alternative, unresolved" : state.reviewed ? "submitted, unresolved" : "queued, unresolved";
  const label=`${card.cost} power${planned?`, ${phase}`:""}${pending?". Click to return this card to your hand.":""}`;
  return `<${tag} class="mini-card ${player ? "player-card" : ""} ${pending ? "pending-card" : ""} ${planned ? "planned-card" : ""}" ${pending ? `data-pending="${card.id}" data-card-id="${card.id}"` : ""} aria-label="${label}"><span class="mini-value">${card.cost}</span>${pending ? '<span class="pending-remove" aria-hidden="true">×</span>' : ""}</${tag}>`;
}

function cardArt(cost) {
  const color=CARD_COLORS[cost].ink;
  const rotation=cost*13;
  const lines=Array.from({length:cost+2},(_,i)=>{
    const angle=(i/(cost+2))*Math.PI*2;
    return `<path d="M50 50 ${50+Math.cos(angle)*29} ${50+Math.sin(angle)*29}" opacity=".2"/>`;
  }).join("");
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="glow-${cost}"><stop stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#glow-${cost})"/><g fill="none" stroke="${color}" stroke-width=".7"><circle cx="50" cy="50" r="34" opacity=".18"/><path d="m50 9 35.5 20.5v41L50 91 14.5 70.5v-41z" opacity=".14"/>${lines}<g transform="rotate(${rotation} 50 50)"><path d="M50 19 77 35v30L50 81 23 65V35Z" opacity=".55" fill="${color}" fill-opacity=".05"/><path d="m50 29 18 10v22L50 71 32 61V39Z" opacity=".25"/><path d="M50 19v62M23 35l54 30M77 35 23 65" opacity=".2"/></g></g><text x="50" y="61" fill="${color}" text-anchor="middle" font-size="33" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="600" style="paint-order:stroke;stroke:#1d222b;stroke-width:3">${cost}</text></svg>`;
}

function handCard(card) {
  const selected=state.selected===card.id;
  const unavailable=card.cost>state.turn-usedEnergy(displayedPlan());
  const color=CARD_COLORS[card.cost];
  return `<button class="hand-card ${selected?"selected":""} ${unavailable?"unaffordable":""}" style="--card-ink:${color.ink};--card-border:${color.border};--card-bg:${color.bg}" data-card-id="${card.id}" aria-label="${card.cost} energy, ${card.cost} power${unavailable?", insufficient energy":""}. Select, then choose a lane." aria-pressed="${selected}" ${state.reviewed?"disabled":""}><span class="card-art">${cardArt(card.cost)}</span><span class="card-registration" aria-hidden="true"></span></button>`;
}

function renderBoard() {
  const plan=displayedPlan();
  const theirs=boardTotals(state.scenario.opponent);
  const ours=boardTotals(state.scenario.player);
  const powerTotal=(value,margin,projected=null)=>`<span class="power-total${margin>0?" leading-total":""}" title="${margin>0?`Revealed board: ahead by ${margin} power`:`${value} revealed power`}" aria-label="${value} revealed power${margin>0?`, ahead by ${margin}`:""}">${value}</span>${projected!==null?`<span class="planned-total" title="Planned total: ${projected}. The opponent's current-turn play is not revealed." aria-label="Planned total ${projected}; opponent turn unresolved"><span class="projection-arrow" aria-hidden="true">→</span><span>${projected}</span></span>`:""}`;
  $("#game-table").innerHTML=LANES.map((name,lane)=>{
    const pending=plan.filter((item)=>item.lane===lane).map((item)=>cardById(item.id)).filter(Boolean);
    const added=pending.reduce((sum,card)=>sum+card.cost,0);
    const projected=ours[lane]+added;
    // Leadership describes only the revealed board. Neither queued nor
    // submitted-but-unresolved cards establish a current-turn lane result.
    const margin=ours[lane]-theirs[lane];
    const leader=margin>0?"player":margin<0?"opponent":"tie";
    const leading=leader==="tie"?"":`${leader}-leading`;
    const available=state.scenario.player[lane].length+pending.length<4;
    const target=state.selected && available && !state.reviewed;
    const slots=(cards,player)=>[...cards.map((card)=>miniCard(card,player)),...Array.from({length:Math.max(0,4-cards.length)},()=>'<span class="empty-slot" aria-hidden="true"></span>')].join("");
    const selfCards=[...state.scenario.player[lane].map((card)=>miniCard(card,true)),...pending.map((card)=>miniCard(card,true,state.preview===null&&!state.reviewed,true)),...Array.from({length:Math.max(0,4-state.scenario.player[lane].length-pending.length)},()=>'<span class="empty-slot" aria-hidden="true"></span>')].join("");
    return `<section class="lane ${leading} ${target ? "selected-target" : ""}" data-lane="${lane}" data-revealed-leader="${leader}" tabindex="0" aria-label="${name} lane. Revealed power: opponent ${theirs[lane]}, you ${ours[lane]}. ${added?`Your planned total ${projected}; opponent turn unresolved. `:""}${4-state.scenario.player[lane].length-pending.length} free slots. ${state.selected ? "Press Enter to queue your selected card." : ""}"><div class="lane-side opponent-side"><div class="lane-cap opponent-cap">${powerTotal(theirs[lane],-margin)}</div><div class="board-zone opponent-zone"><div class="card-grid">${slots(state.scenario.opponent[lane],false)}</div></div></div><div class="location-divider" aria-hidden="true"><span class="location-marker"></span></div><div class="lane-side player-side"><div class="board-zone player-zone"><div class="card-grid">${selfCards}</div></div><div class="lane-cap player-cap">${powerTotal(ours[lane],margin,added?projected:null)}</div></div></section>`;
  }).join("");
  $("#turn-selector").innerHTML=[6,5,4,3,2,1].map(turn=>`<button class="turn-button ${state.turn===turn?"active":""}" data-turn="${turn}" aria-label="Practice turn ${turn}" aria-current="${state.turn===turn?"step":"false"}">${turn}</button>`).join("");
  $("#hand").innerHTML=state.scenario.hand.filter((card)=>!plan.some((item)=>item.id===card.id)).map(handCard).join("");
  const remaining=state.scenario.hand.length-plan.length;
  $("#hand").classList.toggle("empty",remaining===0);
  $("#energy-remaining").textContent=state.turn-usedEnergy(plan);
  $("#energy-total").textContent=state.turn;
  $("#undo-button").disabled=!state.history.length||state.reviewed;
  $("#submit-button").innerHTML=state.reviewed ? `Next${icon("chevron")}` : state.mode==="playground" ? `Review${icon("chevron")}` : `Submit${icon("chevron")}`;
  $(".workspace").classList.toggle("previewing",state.preview!==null);
}

function renderSettings() {
  const cards=deckCards();
  const counts=Array.from({length:6},(_,index)=>cards.filter((cost)=>cost===index+1).length);
  const max=Math.max(...counts,1);
  $("#deck-curve").innerHTML=counts.map((count,index)=>`<div class="curve-column" title="${index+1} energy: ${count} cards"><div class="curve-bar" style="height:${Math.max(4,count/max*35)}px"></div><span>${index+1}</span></div>`).join("");
  $("#deck-curve").setAttribute("aria-label",`Deck curve: ${counts.map((count,index)=>`${count} cards at ${index+1} energy`).join(", ")}`);
  $$(".mode-button").forEach((button)=>{
    const active=button.dataset.mode===state.mode;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  $("#edit-position").hidden=state.mode!=="playground";
  $("#settings-panel").classList.toggle("mobile-open",state.mobileSettings);
  $("#player-deck").value=state.deck;
  $("#opponent-deck").value=state.opponent;
}

function examplePlans() {
  // A legal comparison fixture, not a solver recommendation.
  if(state.plan.length) {
    for(const rotation of [1,2]) {
      const occupied=state.scenario.player.map(lane=>lane.length),plan=[];
      for(const item of state.plan) {
        const lane=[(item.lane+rotation)%3,(item.lane+3-rotation)%3,item.lane].find(index=>occupied[index]<4);
        if(lane===undefined)break;
        plan.push({id:item.id,lane});occupied[lane]++;
      }
      const key=items=>items.map(item=>`${item.id}:${item.lane}`).sort().join("|");
      if(plan.length===state.plan.length&&key(plan)!==key(state.plan))return[{plan}];
    }
    return [];
  }
  const card=[...state.scenario.hand].filter(card=>card.cost<=state.turn).sort((a,b)=>b.cost-a.cost)[0];
  const lane=state.scenario.player.findIndex(cards=>cards.length<4);
  return card&&lane!==-1?[{plan:[{id:card.id,lane}]}]:[];
}

function planLabel(plan) {
  if (!plan.length) return "Pass this turn";
  return plan.map((item)=>`${cardById(item.id)?.cost || "?"} → ${LANES[item.lane]}`).join(" · ");
}

function renderReview() {
  const root=$("#review-content");
  $("#review-panel").classList.toggle("review-idle",!state.reviewed);
  if(!state.reviewed){
    root.innerHTML=`<div class="review-panel-heading" aria-hidden="true">${icon("chart")}<span class="review-heading-rule"></span></div><div class="concealed-review" role="img" aria-label="Review is available after you submit your turn."><div class="concealed-grid"></div><svg class="concealed-routes" viewBox="0 0 240 220" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".6"><path d="M-12 210C105 198 43 33 118 37S153 170 252 186"/><path d="M-10 218C111 203 49 37 120 42S151 174 250 195"/><path d="M-8 226C117 210 55 42 122 47S148 179 248 204"/><circle cx="120" cy="110" r="66" stroke-dasharray="1 7"/></g></svg><span class="lock-orbit">${icon(state.mode==="training"?"lock":"lab")}</span></div>`;
    return;
  }
  const heading=`<div class="result-label"><button class="example-switch" data-action="review-example" title="Illustrative feedback; solver not connected. Cycle example verdicts." aria-label="Illustrative feedback, solver not connected. Cycle example verdicts.">Example${icon("down")}</button></div>`;
  const samples={
    good:{title:"Good move",loss:0,symbol:"check",why:"The same energy keeps two lanes competitive instead of adding more power to a lane already secured."},
    close:{title:"Small loss",loss:2,symbol:"warning",why:"A different placement contests a second lane more effectively without spending more energy."},
    mistake:{title:"Mistake",loss:14,symbol:"close",why:"The turn commits too much power to one lane, leaving too little to compete for a second."}
  };
  const sample=samples[state.feedbackExample];
  root.innerHTML=`${heading}<div class="result-body result-${state.feedbackExample} ${state.preview!==null?"result-comparing":""}"><div class="result-verdict"><span class="result-check ${sample.symbol==="warning"?"warning":""}" aria-hidden="true">${sample.symbol==="warning"?"!":icon(sample.symbol)}</span><h2>${sample.title}</h2></div><div class="result-loss"><strong>${sample.loss}<abbr class="loss-unit" title="Percentage points of expected match score">pp</abbr></strong><p>Value lost</p></div><button class="result-why-button" data-action="review-why" aria-expanded="${state.showWhy}">${state.showWhy?"Close":"Why?"}${icon("down")}</button>${state.showWhy?`<p class="result-explanation">${sample.why}</p>`:""}<button class="result-compare" data-action="review-compare" ${examplePlans().length?"":"disabled"}>${state.preview===null?"Compare":"Your play"}${icon(state.preview===null?"chevron":"undo")}</button><div class="result-controls"><button class="secondary-button" data-action="retry">${icon("refresh")}Retry</button></div></div>`;
}

function render() { renderSettings(); renderBoard(); renderReview(); }

function submitTurn() {
  if (state.reviewed) return nextPosition();
  state.selected=null;
  state.reviewed=true;
  state.preview=null;
  state.reviewTab="overview";
  state.completed.add(state.exercise);
  render();
  announce("Turn submitted. The example review is open. All numerical feedback is illustrative.");
  if (window.matchMedia("(max-width: 730px)").matches) $("#review-panel").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
}
function nextPosition() {
  state.exercise=state.exercise===12 ? 1 : state.exercise+1;
  resetPosition({message:`Position ${String(state.exercise).padStart(2,"0")} ready.`});
  if (window.matchMedia("(max-width: 730px)").matches) $(".workspace").scrollIntoView({behavior:"smooth",block:"start"});
}

function openDialog(title,body) {
  dialogReturnFocus=document.activeElement;
  $("#dialog-content").innerHTML=`<div class="dialog-header"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon("close")}</button></div><div class="dialog-body">${body}</div>`;
  const dialog=$("#app-dialog");
  if (!dialog.open) dialog.showModal();
}
function closeDialog() { $("#app-dialog").close(); }

function showModel() {
  openDialog("Numerical model",`<p>Numerical Snap keeps the decisions about <strong>timing, energy, and lane allocation</strong>, using cards whose power equals their energy cost.</p><ul><li>12 cards per deck. Three opening cards, then one draw at the start of each turn.</li><li>Energy equals the current turn, from 1 through 6. Unspent energy does not carry over.</li><li>Three neutral lanes, with four card slots per player in each lane.</li><li>Both players commit their entire turn before revealing their actions.</li><li>Win more lanes. If lane wins are tied, compare total power. Equal total power is a draw.</li><li>No card abilities, special locations, snapping, or retreating in this initial workspace.</li></ul><div class="dialog-notice"><strong>Milestone One · visual mockup</strong><br>Card placement and energy checks work locally. Review numbers illustrate the proposed interface. They are not solver results or recommendations for a live game.</div>`);
}
function showDeck(which="player") {
  const cards=deckCards(which);
  const choice=which==="player" ? state.deck : state.opponent;
  openDialog(`${deckName(choice)} deck`, `<p>Each number is both a card’s energy cost and its power. The exact preset contains these 12 cards.</p><div class="deck-list">${[...cards].sort((a,b)=>a-b).map((cost)=>`<span class="deck-value">${cost}</span>`).join("")}</div><p><strong>${cards.reduce((sum,cost)=>sum+cost,0)} total power</strong> · ${(cards.reduce((sum,cost)=>sum+cost,0)/12).toFixed(2)} average energy</p><button class="primary-button" data-action="custom-${which}">Customize ${which==="player"?"your":"opponent"} deck${icon("chevron")}</button>`);
}
function editCustomDeck(which="player") {
  const cards=which==="player" ? state.customDeck : state.customOpponent;
  openDialog(`Your ${which==="player" ? "custom deck" : "opponent’s deck"}`,`<form id="custom-deck-form" data-deck-owner="${which}"><p>Enter exactly 12 energy values between 1 and 6, separated by commas. Each card has matching power.</p><label for="custom-deck-values">Deck composition</label><textarea id="custom-deck-values" name="cards" spellcheck="false" required>${cards.join(", ")}</textarea><div class="form-error" id="deck-error" role="alert"></div><button class="primary-button" type="submit">Use this deck${icon("check")}</button></form>`);
}
function showGuide() {
  openDialog("Controls",`<p><strong>1. Read the position.</strong><br>Your hand and the public board are visible. Your opponent’s hand stays hidden.</p><p><strong>2. Make a complete turn.</strong><br>Drag cards into lanes, or select a card and click a lane. Click a queued card to return it to your hand. You can also pass.</p><p><strong>3. Submit, then investigate.</strong><br>Open the review, compare alternatives, and retry the position. Your decisions are kept separate from the outcome of a particular game.</p><div class="dialog-notice">This first milestone demonstrates the experience. The review values are illustrative. Validated solver feedback is the next milestone.</div>`);
}
function showShortcuts() {
  openDialog("Shortcuts",`<div class="keyboard-row"><span>Submit turn / next position</span><span class="keycap">Enter</span></div><div class="keyboard-row"><span>Undo your last placement</span><span class="keycap">Z</span></div><div class="keyboard-row"><span>Place selected card in a lane</span><span><span class="keycap">1</span><span class="keycap">2</span><span class="keycap">3</span></span></div><div class="keyboard-row"><span>Cancel selection / close dialog</span><span class="keycap">Esc</span></div><p style="margin-top:18px">Use Tab to move between controls. Select a card, then focus a lane and press Enter to place it.</p>`);
}

function editPosition() {
  const values=(board,lane)=>board[lane].map((card)=>card.cost).join(", ");
  openDialog("Position",`<form id="position-form"><p>Each lane accepts up to four cards per side. Enter energy values separated by commas; leave a lane blank for no cards.</p><div class="editor-turn"><label for="editor-turn">Turn</label><div class="select-wrap"><select id="editor-turn" name="turn">${[1,2,3,4,5,6].map((turn)=>`<option ${turn===state.turn?"selected":""}>${turn}</option>`).join("")}</select>${icon("down")}</div></div><div class="editor-grid">${LANES.map((name,lane)=>`<div><span>${name.toUpperCase()} LANE</span><label for="opponent-lane-${lane}">Opponent</label><input id="opponent-lane-${lane}" name="opponent-${lane}" value="${values(state.scenario.opponent,lane)}" placeholder="e.g. 2, 3" autocomplete="off"><label for="player-lane-${lane}" style="margin-top:12px">Your board</label><input id="player-lane-${lane}" name="player-${lane}" value="${values(state.scenario.player,lane)}" placeholder="e.g. 1, 4" autocomplete="off"></div>`).join("")}</div><div class="editor-hand"><label for="editor-hand">Your hand · up to 7 cards</label><input id="editor-hand" name="hand" value="${state.scenario.hand.map((card)=>card.cost).join(", ")}" autocomplete="off"></div><div class="form-error" id="position-error" role="alert"></div><button class="primary-button" type="submit">Explore this position${icon("chevron")}</button></form>`);
}
function parseCards(value,maximum,{exact=false}={}) {
  const text=String(value).trim();
  const cards=text ? text.split(/[\s,]+/).filter(Boolean).map(Number) : [];
  if (cards.some((cost)=>!Number.isInteger(cost)||cost<1||cost>6)) throw new Error("Use whole-number energy values from 1 through 6.");
  if (exact && cards.length!==maximum) throw new Error(`Please enter exactly ${maximum} cards.`);
  if (cards.length>maximum) throw new Error(`This field accepts at most ${maximum} cards.`);
  return cards;
}

const actions={
  "review-example":()=>{const order=["good","close","mistake"];state.feedbackExample=order[(order.indexOf(state.feedbackExample)+1)%3];renderReview();},
  "review-why":()=>{state.showWhy=!state.showWhy;renderReview();},
  "review-compare":()=>{if(state.preview===null&&!examplePlans().length)return;state.preview=state.preview===null?0:null;renderBoard();renderReview();},

  undo:()=>{if(!state.history.length||state.reviewed)return;state.plan=state.history.pop();state.selected=null;render();announce("Last placement undone.");},
  submit:submitTurn,
  retry:()=>resetPosition({newScenario:false,message:"Turn reset."}),
  next:nextPosition,
  "back-to-play":()=>{state.preview=null;renderBoard();renderReview();},
  model:showModel,
  "view-deck":()=>showDeck(),
  "custom-player":()=>editCustomDeck("player"),
  "custom-opponent":()=>editCustomDeck("opponent"),
  guide:showGuide,
  shortcuts:showShortcuts,
  turns:()=>openDialog("Choose a decision point.","<p>The turn rail opens a preset position at the selected turn. Each position has its own legal hand, energy budget, and public board.</p><p>Selecting an earlier turn starts a new drill. It does not rewind your submitted actions into a different history.</p>"),
  future:()=>openDialog("More ways to study.",`<p>These game variations are planned for a later milestone:</p><ul><li>Adjust deck size and card variety.</li><li>Change the number of card slots in a lane.</li><li>Explore different power-to-energy values.</li><li>Add a seventh turn, as with Limbo.</li><li>Practice snapping and retreating with expected cube value.</li></ul><div class="dialog-notice">Each variation changes the game being analyzed and will need matching solver support.</div>`),
  "edit-position":editPosition,
  "toggle-setup":()=>{state.mobileSettings=!state.mobileSettings;renderSettings();},
  "close-dialog":closeDialog,
};

document.addEventListener("click",(event)=>{
  if (Date.now()<suppressClickUntil && event.target.closest("[data-card-id],[data-lane]")) return;
  const action=event.target.closest("[data-action]");
  if(action){actions[action.dataset.action]?.();return;}
  const mode=event.target.closest("[data-mode]");
  if(mode && mode.dataset.mode!==state.mode){state.mode=mode.dataset.mode;state.mobileSettings=false;resetPosition({newScenario:false});return;}
  const turn=event.target.closest("[data-turn]");
  if(turn){state.turn=Number(turn.dataset.turn);resetPosition({message:`Turn ${state.turn} drill ready.`});return;}
  const pending=event.target.closest("[data-pending]");
  if(pending){removeCard(pending.dataset.pending);return;}
  const hand=event.target.closest(".hand-card");
  if(hand && !state.reviewed){const card=cardById(hand.dataset.cardId);if(card.cost>state.turn-usedEnergy())return toast("There isn’t enough energy for this card.");state.selected=state.selected===card.id?null:card.id;renderBoard();return;}
  const lane=event.target.closest("[data-lane]");
  if(lane&&state.selected){placeCard(state.selected,Number(lane.dataset.lane));return;}
  const tab=event.target.closest("[data-review-tab]");
  if(tab){state.reviewTab=tab.dataset.reviewTab;state.preview=null;renderBoard();renderReview();$( `[data-review-tab="${state.reviewTab}"]`).focus();return;}
  const alternative=event.target.closest("[data-alternative]");
  if(alternative){state.preview=Number(alternative.dataset.alternative);renderBoard();renderReview();return;}
  if(state.mobileSettings && !event.target.closest("#settings-panel")){state.mobileSettings=false;renderSettings();}
});

$("#player-deck").addEventListener("change",(event)=>{
  if(event.target.value==="custom"){event.target.value=state.deck;return editCustomDeck("player");}
  state.deck=event.target.value;resetPosition({message:`${deckName(state.deck)} deck selected.`});
});
$("#opponent-deck").addEventListener("change",(event)=>{
  if(event.target.value==="custom"){event.target.value=state.opponent;return editCustomDeck("opponent");}
  state.opponent=event.target.value;resetPosition({message:`Opponent: ${deckName(state.opponent).toLowerCase()}.`});
});

document.addEventListener("submit",(event)=>{
  const form=event.target;
  if(form.id==="custom-deck-form"){
    event.preventDefault();
    try{
      const cards=parseCards(new FormData(form).get("cards"),12,{exact:true});
      if(form.dataset.deckOwner==="player"){state.customDeck=cards;state.deck="custom";}
      else{state.customOpponent=cards;state.opponent="custom";}
      closeDialog();resetPosition({message:"Custom deck ready."});
    }catch(error){$("#deck-error").textContent=error.message;}
  }
  if(form.id==="position-form"){
    event.preventDefault();
    try{
      const data=new FormData(form);
      const read=(key,max)=>parseCards(data.get(key),max).map((cost,index)=>({cost,id:`editor-${key}-${index}`}));
      const scenario={player:[0,1,2].map((lane)=>read(`player-${lane}`,4)),opponent:[0,1,2].map((lane)=>read(`opponent-${lane}`,4)),hand:read("hand",7),custom:true};
      state.turn=Number(data.get("turn"));state.scenario=scenario;
      closeDialog();resetPosition({newScenario:false,message:"Your position is ready to explore."});
    }catch(error){$("#position-error").textContent=error.message;}
  }
});

document.addEventListener("keydown",(event)=>{
  if($("#app-dialog").open || event.target.closest("input,textarea,select"))return;
  if(event.key==="Escape"){state.selected=null;state.preview=null;state.mobileSettings=false;render();return;}
  if(event.key.toLowerCase()==="z" && !event.altKey){event.preventDefault();actions.undo();return;}
  if(["1","2","3"].includes(event.key)&&state.selected){event.preventDefault();placeCard(state.selected,Number(event.key)-1);return;}
  if(event.key==="Enter" && !event.target.closest("button,a")){
    const lane=event.target.closest("[data-lane]");
    event.preventDefault();
    if(lane&&state.selected)placeCard(state.selected,Number(lane.dataset.lane));else submitTurn();
  }
});

// Pointer-based dragging works with a mouse, trackpad, or touch; click-to-place
// and keyboard placement are independent alternatives.
document.addEventListener("pointerdown",(event)=>{
  const origin=event.target.closest(".hand-card,.pending-card");
  if(!origin || state.reviewed || event.button!==0)return;
  const id=origin.dataset.cardId;
  const card=cardById(id);
  if(!card)return;
  if(origin.classList.contains("hand-card")&&card.cost>state.turn-usedEnergy())return;
  pointerDrag={id,origin,startX:event.clientX,startY:event.clientY,active:false,ghost:null,pointerId:event.pointerId};
});
document.addEventListener("pointermove",(event)=>{
  if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
  const drag=pointerDrag;
  if(!drag.active && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<7)return;
  if(!drag.active){
    drag.active=true;
    drag.ghost=document.createElement("div");
    const card=cardById(drag.id);
    drag.ghost.innerHTML=handCard(card);
    drag.ghost=drag.ghost.firstElementChild;
    drag.ghost.classList.remove("selected","unaffordable");
    drag.ghost.classList.add("drag-ghost");
    drag.ghost.removeAttribute("data-card-id");
    drag.ghost.setAttribute("aria-hidden","true");
    drag.ghost.tabIndex=-1;
    document.body.append(drag.ghost);
    drag.origin.classList.add("dragging-origin");
    $$(".lane").forEach((lane)=>lane.classList.add("selected-target"));
  }
  event.preventDefault();
  drag.ghost.style.left=`${event.clientX-44}px`;
  drag.ghost.style.top=`${event.clientY-48}px`;
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest("[data-lane]");
  $$(".lane").forEach((lane)=>lane.classList.toggle("drag-over",lane===target));
},{passive:false});
function finishDrag(event,cancelled=false){
  if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
  const drag=pointerDrag;
  pointerDrag=null;
  if(!drag.active)return;
  suppressClickUntil=Date.now()+350;
  const target=document.elementFromPoint(event.clientX,event.clientY);
  const lane=target?.closest("[data-lane]");
  drag.ghost.remove();
  drag.origin.classList.remove("dragging-origin");
  $$(".lane").forEach((item)=>item.classList.remove("drag-over","selected-target"));
  if(cancelled)return renderBoard();
  if(lane)placeCard(drag.id,Number(lane.dataset.lane));
  else if(target?.closest("#hand"))removeCard(drag.id);
  else renderBoard();
}
document.addEventListener("pointerup",(event)=>finishDrag(event));
document.addEventListener("pointercancel",(event)=>finishDrag(event,true));
$("#app-dialog").addEventListener("click",(event)=>{
  const bounds=event.currentTarget.getBoundingClientRect();
  if(event.target===event.currentTarget && (event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)) closeDialog();
});
$("#app-dialog").addEventListener("close",()=>{if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus();});

state.scenario=makeScenario();
render();
