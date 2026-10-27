/* Milestone One: browser-local interactions and explicitly illustrative review data. */
"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, extra = "") => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LANES = ["Left", "Middle", "Right"];
const PRESETS = {
  midrange: {name:"Midrange", cards:[1,2,2,2,3,3,3,4,4,4,5,6], order:[2,3,4,1,6,2,3,3,4,2,4,5]},
  low: {name:"Low curve", cards:[1,1,1,1,2,2,2,2,3,3,4,5], order:[2,3,1,1,4,2,2,1,5,3,2,1]},
  balanced: {name:"Balanced", cards:[1,1,2,2,3,3,4,4,5,5,6,6], order:[2,3,4,1,6,2,3,5,4,1,5,6]},
};

const state = {
  mode:"training", turn:6, deck:"midrange", opponent:"unknown", exercise:1,
  customDeck:[...PRESETS.midrange.cards], customOpponent:[...PRESETS.midrange.cards],
  plan:[], history:[], selected:null, reviewed:false, preview:null, showWhy:false, feedbackExample:"good",
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
  state.showWhy = false;
  state.preview = null;
  if (newScenario) state.scenario = makeScenario();
  render();
  if (message) toast(message);
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
  announce(`${card.cost}-energy card placed in ${LANES[lane].toLowerCase()} lane. ${state.turn-usedEnergy()} energy remaining.`);
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


function handCard(card) {
  const selected=state.selected===card.id;
  const unavailable=card.cost>state.turn-usedEnergy(displayedPlan());
  return `<button class="hand-card ${selected?"selected":""} ${unavailable?"unaffordable":""}" data-card-id="${card.id}" aria-label="${card.cost} energy, ${card.cost} power${unavailable?", insufficient energy":""}. Select, then choose a lane." aria-pressed="${selected}" ${state.reviewed?"disabled":""}><span class="energy-bubble">${card.cost}</span></button>`;
}
function slot(card,{pending=false,alternative=false}={}) {
  const tag=pending?"button":"span";
  return `<${tag} class="board-slot occupied ${pending?"pending pending-card":""} ${alternative?"alternative":""}" ${pending?`data-pending="${card.id}" data-card-id="${card.id}" aria-label="${card.cost} power queued. Return to hand."`:`aria-label="${card.cost} power"`}><span class="slot-value">${card.cost}</span></${tag}>`;
}
function planKey(plan) { return plan.map(item=>`${item.id}:${item.lane}`).sort().join("|"); }
function alternativePlan() {
  if(state.plan.length) {
    for(const rotation of [1,2]) {
      const occupied=state.scenario.player.map(lane=>lane.length);
      const candidate=[];
      for(const item of state.plan) {
        const preference=[(item.lane+rotation)%3,(item.lane+3-rotation)%3,item.lane];
        const lane=preference.find(index=>occupied[index]<4);
        if(lane===undefined)break;
        candidate.push({id:item.id,lane});occupied[lane]++;
      }
      if(candidate.length===state.plan.length&&planKey(candidate)!==planKey(state.plan))return candidate;
    }
    return null;
  }
  const card=[...state.scenario.hand].filter(card=>card.cost<=state.turn).sort((a,b)=>b.cost-a.cost)[0];
  const lane=state.scenario.player.findIndex(cards=>cards.length<4);
  return card&&lane!==-1?[{id:card.id,lane}]:null;
}
function examplePlans() { const plan=alternativePlan(); return plan?[{plan}]:[]; }
function renderBoard() {
  const plan=displayedPlan();
  const originalTotals=boardTotals(state.scenario.player);
  const submittedTotals=originalTotals.map((power,lane)=>power+state.plan.filter(item=>item.lane===lane).reduce((sum,item)=>sum+cardById(item.id).cost,0));
  const opponentTotals=boardTotals(state.scenario.opponent);
  const empty='<span class="board-slot" aria-hidden="true"></span>';
  $("#game-table").innerHTML=LANES.map((name,lane)=>{
    const queued=plan.filter(item=>item.lane===lane).map(item=>cardById(item.id)).filter(Boolean);
    const total=originalTotals[lane]+queued.reduce((sum,card)=>sum+card.cost,0);
    const changed=state.preview!==null&&total!==submittedTotals[lane];
    const self=[...state.scenario.player[lane].map(card=>slot(card)),...queued.map(card=>slot(card,{pending:!state.reviewed,alternative:state.preview!==null})),...Array.from({length:Math.max(0,4-state.scenario.player[lane].length-queued.length)},()=>empty)].join("");
    const opponent=[...state.scenario.opponent[lane].map(card=>slot(card)),...Array.from({length:4-state.scenario.opponent[lane].length},()=>empty)].join("");
    return `<section class="lane ${state.selected&&!state.reviewed?"can-place":""}" data-lane="${lane}" tabindex="0" aria-label="${name} lane. Opponent ${opponentTotals[lane]} power, ${state.scenario.opponent[lane].length} of 4 slots used. You ${total} power, ${state.scenario.player[lane].length+queued.length} of 4 slots used.${state.selected?" Press Enter to place the selected card.":""}"><div class="zone opponent-zone"><div class="lane-score"><span class="power-total">${opponentTotals[lane]}</span></div><div class="slot-grid">${opponent}</div></div><div class="zone player-zone"><div class="lane-score">${changed?`<span class="old-total">${submittedTotals[lane]}</span><span class="score-arrow" aria-hidden="true">→</span>`:""}<span class="power-total">${total}</span></div><div class="slot-grid">${self}</div></div></section>`;
  }).join("");
  $("#turn-selector").innerHTML=[6,5,4,3,2,1].map(turn=>`<button class="turn-button ${turn===state.turn?"active":""}" data-turn="${turn}" aria-label="Practice turn ${turn}" aria-current="${turn===state.turn?"step":"false"}">${turn}</button>`).join("");
  const unplayed=state.scenario.hand.filter(card=>!plan.some(item=>item.id===card.id));
  $("#hand").innerHTML=unplayed.length?unplayed.map(handCard).join(""):'<span class="hand-empty">All cards placed</span>';
  $("#energy-remaining").textContent=state.turn-usedEnergy(plan);
  $("#energy-total").textContent=state.turn;
  $("#selection-note").textContent=state.preview!==null?"Alternative":state.selected?"Choose a lane":"";
  $("#board-area").classList.toggle("comparison",state.preview!==null);
  $("#undo-button").disabled=!state.history.length||state.reviewed;
  $("#clear-button").disabled=!state.plan.length||state.reviewed;
  $("#retry-button").hidden=!state.reviewed;
  $("#submit-button").textContent=state.reviewed?"Next position":state.mode==="playground"?"Analyze":"Submit";
  $("#comparison-arrows").innerHTML="";
  if(state.preview!==null) {
    const pairs=new Set();
    const paths=[];
    for(const item of plan) {
      const original=state.plan.find(previous=>previous.id===item.id);
      if(!original||original.lane===item.lane)continue;
      const pair=`${original.lane}-${item.lane}`;
      if(pairs.has(pair))continue;
      pairs.add(pair);
      const from=50+original.lane*100,to=50+item.lane*100;
      paths.push(`<path d="M${from} 90 C${from} 96 ${to} 96 ${to} 90" fill="none" stroke="#a6c6db" stroke-width="1" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/><circle cx="${to}" cy="90" r="1.1" fill="#a6c6db"/>`);
    }
    $("#comparison-arrows").innerHTML=paths.length?`<svg viewBox="0 0 300 100" preserveAspectRatio="none">${paths.join("")}</svg>`:"";
  }
}
const RESULT_EXAMPLES={
  good:{title:"Good move",magnitude:"No expected value lost",symbol:"check",why:"Example rationale: the same energy keeps two lanes competitive instead of adding power to an already secure lane."},
  close:{title:"Small loss",magnitude:"2 percentage points below best",symbol:"warning",why:"Example rationale: a different placement uses the same energy to contest a second lane more effectively."},
  mistake:{title:"Mistake",magnitude:"14 percentage points below best",symbol:"close",why:"Example rationale: too much power is committed to one lane, leaving too little to compete for a second."}
};
function renderResult() {
  const root=$("#results-overlay");
  root.hidden=!state.reviewed;
  if(!state.reviewed){root.innerHTML="";root.className="results-overlay";return;}
  const sample=RESULT_EXAMPLES[state.feedbackExample];
  root.className=`results-overlay result-${state.feedbackExample} ${state.showWhy?"expanded":""} ${state.preview!==null?"comparing":""}`;
  if(state.preview!==null) {
    root.innerHTML=`<span class="comparison-label">Alternative · example</span><div class="result-actions"><button data-action="compare">Your play</button></div>`;
    return;
  }
  root.innerHTML=`<span class="example-label" title="Illustrative feedback for this visual mockup; the move is not solver-graded.">Example feedback</span><div class="verdict-row"><span class="verdict-icon ${sample.symbol==="warning"?"warning":""}" aria-hidden="true">${sample.symbol==="warning"?"!":icon(sample.symbol)}</span><h2 class="verdict-title">${sample.title}</h2></div><p class="result-magnitude">${sample.magnitude}</p>${state.showWhy?`<p class="result-why">${sample.why}</p>`:""}<div class="result-actions"><button data-action="why" aria-expanded="${state.showWhy}">${state.showWhy?"Hide why":"Why?"}</button><button data-action="compare" ${alternativePlan()?"":"disabled"}>Compare</button></div>`;
}
function renderChrome() {
  $$(".mode-button").forEach(button=>{
    const active=button.dataset.mode===state.mode;
    button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));
  });
  $("#exercise-number").textContent=String(state.exercise).padStart(2,"0");
  $("#edit-position").hidden=state.mode!=="playground";
}
function render() {renderChrome();renderBoard();renderResult();}
function submitTurn() {
  if(state.reviewed)return nextPosition();
  state.reviewed=true;state.selected=null;state.preview=null;state.showWhy=false;render();
  announce("Example feedback is open above the board. This prototype has not solver-graded your play.");
}
function nextPosition() {
  state.exercise=state.exercise===12?1:state.exercise+1;
  resetPosition();
  announce(`Position ${state.exercise} ready.`);
}
function openDialog(title,body) {
  dialogReturnFocus=document.activeElement;
  $("#dialog-content").innerHTML=`<div class="dialog-header"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close">${icon("close")}</button></div><div class="dialog-body">${body}</div>`;
  if(!$("#app-dialog").open)$("#app-dialog").showModal();
}
function closeDialog() {$("#app-dialog").close();}
function deckOptions(selected,opponent=false) {
  return `${opponent?`<option value="unknown" ${selected==="unknown"?"selected":""}>Unknown</option>`:""}${["midrange","low","balanced","custom"].map(choice=>`<option value="${choice}" ${selected===choice?"selected":""}>${deckName(choice)}</option>`).join("")}`;
}
function showSettings() {
  openDialog("Settings",`<div class="settings-row"><label for="player-deck">Your deck</label><div class="settings-field"><select id="player-deck">${deckOptions(state.deck)}</select><button class="text-button" data-action="view-deck">12 cards</button></div></div><div class="settings-row"><label for="opponent-deck">Opponent deck</label><div class="settings-field"><select id="opponent-deck">${deckOptions(state.opponent,true)}</select><button class="text-button" data-action="opponent-details">${state.opponent==="unknown"?"Prior":"12 cards"}</button></div></div><div class="settings-section"><button class="text-button" data-action="model">Model and assumptions</button><button class="text-button" data-action="future">Additional rules · later</button><button class="text-button" data-action="help">Controls</button></div><div class="settings-section"><div class="settings-row"><label for="feedback-example">Example feedback</label><select id="feedback-example">${Object.entries(RESULT_EXAMPLES).map(([key,value])=>`<option value="${key}" ${key===state.feedbackExample?"selected":""}>${value.title}</option>`).join("")}</select></div><p class="dialog-note">Visual prototype. Result states and values are illustrative; solver grading is not connected.</p></div>`);
}
function showDeck(which="player") {
  const choice=which==="player"?state.deck:state.opponent;
  if(choice==="unknown")return openDialog("Unknown opponent","<p>The proposed prior is an equal mix of Midrange, Low curve, and Balanced: <strong>⅓ each</strong>.</p><p>Played cards are public. The opponent’s hand and current-turn choices stay hidden.</p><p class=\"dialog-note\">Updating this prior from observed play is planned with solver support.</p>");
  const cards=deckCards(which);
  openDialog(`${deckName(choice)} deck`,`<div class="custom-cards">${[...cards].sort((a,b)=>a-b).map(cost=>`<span class="custom-value">${cost}</span>`).join("")}</div><p>12 cards · power equals cost</p><button class="primary-button" data-action="custom-${which}">Edit deck</button>`);
}
function editCustomDeck(which="player") {
  const cards=which==="player"?[...deckCards()]:state.opponent==="unknown"?[...state.customOpponent]:[...deckCards("opponent")];
  openDialog("Custom deck",`<form id="custom-deck-form" data-deck-owner="${which}"><label for="custom-deck-values">12 values, from 1 to 6</label><textarea id="custom-deck-values" name="cards" spellcheck="false" required>${cards.join(", ")}</textarea><div class="form-error" id="deck-error" role="alert"></div><button class="primary-button" type="submit">Use deck</button></form>`);
}
function showModel() {
  openDialog("Numerical model",`<ul><li>12-card decks; three opening cards and one draw each turn.</li><li>Six turns. Energy equals the turn number and does not carry over.</li><li>Power equals cost. Three lanes, four slots per side, no abilities.</li><li>Both players commit before either turn is revealed.</li><li>Win more lanes. If lane wins tie, compare total power. Equal power is a draw.</li></ul><p>Planned grading uses match score: win = 1, draw = ½, loss = 0.</p><p class="dialog-note">The verdict, loss amount, and rationale in this mockup are examples. Compare previews a legal alternative placement, not a solved recommendation. No opponent response is simulated or revealed.</p>`);
}
function showHelp() {
  openDialog("Controls",`<p>Drag a card into a lane, or select one and click a lane. Click a queued card to return it. Submit an empty turn to pass.</p><div class="shortcut-row"><span>Place selected card</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span></div><div class="shortcut-row"><span>Undo</span><kbd>Z</kbd></div><div class="shortcut-row"><span>Submit / next position</span><kbd>Enter</kbd></div><div class="shortcut-row"><span>Cancel selection</span><kbd>Esc</kbd></div><p style="margin-top:18px">Turns advance upward: 1 at the bottom, 6 at the top. Use the rail to open a preset drill. Arrow up/down also works while a turn button is focused.</p><p>Tab navigates controls. Select a card, then focus a lane and press Enter to place it.</p>`);
}
function editPosition() {
  const values=(board,lane)=>board[lane].map(card=>card.cost).join(", ");
  openDialog("Position",`<form id="position-form"><div class="editor-turn"><label for="editor-turn">Turn</label><select id="editor-turn" name="turn">${[1,2,3,4,5,6].map(turn=>`<option ${turn===state.turn?"selected":""}>${turn}</option>`).join("")}</select></div><div class="editor-grid">${LANES.map((name,lane)=>`<div><strong>${name}</strong><label for="opponent-lane-${lane}">Opponent</label><input id="opponent-lane-${lane}" name="opponent-${lane}" value="${values(state.scenario.opponent,lane)}" autocomplete="off"><label for="player-lane-${lane}">You</label><input id="player-lane-${lane}" name="player-${lane}" value="${values(state.scenario.player,lane)}" autocomplete="off"></div>`).join("")}</div><div class="editor-hand"><label for="editor-hand">Hand · up to 7 cards</label><input id="editor-hand" name="hand" value="${state.scenario.hand.map(card=>card.cost).join(", ")}" autocomplete="off"></div><p class="dialog-note">Separate card values with commas. Each side has four slots per lane.</p><div class="form-error" id="position-error" role="alert"></div><button class="primary-button" type="submit">Use position</button></form>`);
}
function parseCards(value,maximum,{exact=false}={}) {
  const text=String(value).trim();
  const cards=text?text.split(/[\s,]+/).filter(Boolean).map(Number):[];
  if(cards.some(cost=>!Number.isInteger(cost)||cost<1||cost>6))throw new Error("Use whole-number values from 1 through 6.");
  if(exact&&cards.length!==maximum)throw new Error(`Enter exactly ${maximum} cards.`);
  if(cards.length>maximum)throw new Error(`Use at most ${maximum} cards.`);
  return cards;
}
const actions={
  settings:showSettings, help:showHelp, model:showModel,
  reset:()=>resetPosition({newScenario:!state.scenario.custom,message:"Position reset."}),
  undo:()=>{if(!state.history.length||state.reviewed)return;state.plan=state.history.pop();state.selected=null;render();announce("Placement undone.");},
  clear:()=>{if(!state.plan.length||state.reviewed)return;saveHistory();state.plan=[];state.selected=null;render();},
  submit:submitTurn, next:nextPosition,
  retry:()=>resetPosition({newScenario:false}),
  why:()=>{state.showWhy=!state.showWhy;renderResult();},
  compare:()=>{if(state.preview===null&&!alternativePlan())return;state.preview=state.preview===null?0:null;state.showWhy=false;render();announce(state.preview===null?"Your submitted play.":"Example alternative. Changed lane totals show before and after.");},
  "view-deck":()=>showDeck("player"),
  "opponent-details":()=>showDeck("opponent"),
  "custom-player":()=>editCustomDeck("player"),
  "custom-opponent":()=>editCustomDeck("opponent"),
  "edit-position":editPosition,
  "close-dialog":closeDialog,
  future:()=>openDialog("Additional rules","<ul><li>Deck size</li><li>Slots per lane</li><li>Power-to-cost values</li><li>A seventh turn (Limbo)</li><li>Snapping and retreating</li></ul><p class=\"dialog-note\">These variants need corresponding solver support.</p>")
};
document.addEventListener("click",event=>{
  if(Date.now()<suppressClickUntil&&event.target.closest("[data-card-id],[data-lane]"))return;
  const action=event.target.closest("[data-action]");
  if(action){actions[action.dataset.action]?.();return;}
  const mode=event.target.closest("[data-mode]");
  if(mode&&mode.dataset.mode!==state.mode){state.mode=mode.dataset.mode;resetPosition({newScenario:false});return;}
  const turn=event.target.closest("[data-turn]");
  if(turn){state.turn=Number(turn.dataset.turn);resetPosition();return;}
  const pending=event.target.closest("[data-pending]");
  if(pending){removeCard(pending.dataset.pending);return;}
  const hand=event.target.closest(".hand-card");
  if(hand&&!state.reviewed){
    const card=cardById(hand.dataset.cardId);
    if(card.cost>state.turn-usedEnergy())return toast("Not enough energy.");
    state.selected=state.selected===card.id?null:card.id;renderBoard();
    $(`[data-card-id="${card.id}"]`)?.focus({preventScroll:true});return;
  }
  const lane=event.target.closest("[data-lane]");
  if(lane&&state.selected)placeCard(state.selected,Number(lane.dataset.lane));
});
document.addEventListener("change",event=>{
  if(event.target.id==="player-deck"){
    if(event.target.value==="custom")return editCustomDeck("player");
    state.deck=event.target.value;resetPosition();return;
  }
  if(event.target.id==="opponent-deck"){
    if(event.target.value==="custom")return editCustomDeck("opponent");
    state.opponent=event.target.value;resetPosition();return;
  }
  if(event.target.id==="feedback-example"){
    state.feedbackExample=event.target.value;state.preview=null;state.showWhy=false;render();
  }
});
document.addEventListener("submit",event=>{
  const form=event.target;
  if(form.id==="custom-deck-form"){
    event.preventDefault();
    try{
      const cards=parseCards(new FormData(form).get("cards"),12,{exact:true});
      if(form.dataset.deckOwner==="player"){state.customDeck=cards;state.deck="custom";}
      else{state.customOpponent=cards;state.opponent="custom";}
      closeDialog();resetPosition();
    }catch(error){$("#deck-error").textContent=error.message;}
  }
  if(form.id==="position-form"){
    event.preventDefault();
    try{
      const data=new FormData(form);
      const read=(key,max)=>parseCards(data.get(key),max).map((cost,index)=>({cost,id:`editor-${key}-${index}`}));
      const scenario={player:[0,1,2].map(lane=>read(`player-${lane}`,4)),opponent:[0,1,2].map(lane=>read(`opponent-${lane}`,4)),hand:read("hand",7),custom:true};
      state.turn=Number(data.get("turn"));state.scenario=scenario;closeDialog();resetPosition({newScenario:false});
    }catch(error){$("#position-error").textContent=error.message;}
  }
});
document.addEventListener("keydown",event=>{
  if($("#app-dialog").open||event.target.closest("input,textarea,select"))return;
  if(event.key==="Escape"){state.selected=null;state.preview=null;render();return;}
  const turn=event.target.closest("[data-turn]");
  if(turn&&["ArrowUp","ArrowDown"].includes(event.key)){
    event.preventDefault();const next=Math.max(1,Math.min(6,Number(turn.dataset.turn)+(event.key==="ArrowUp"?1:-1)));
    state.turn=next;resetPosition();$(`[data-turn="${next}"]`)?.focus();return;
  }
  if(event.key.toLowerCase()==="z"&&!event.altKey){event.preventDefault();actions.undo();return;}
  if(["1","2","3"].includes(event.key)&&state.selected){event.preventDefault();placeCard(state.selected,Number(event.key)-1);return;}
  if(event.key==="Enter"&&!event.target.closest("button,a")){
    event.preventDefault();const lane=event.target.closest("[data-lane]");
    if(lane&&state.selected)placeCard(state.selected,Number(lane.dataset.lane));else submitTurn();
  }
});
document.addEventListener("pointerdown",event=>{
  const origin=event.target.closest(".hand-card,.pending-card");
  if(!origin||state.reviewed||event.button!==0)return;
  const id=origin.dataset.cardId,card=cardById(id);
  if(!card||(origin.classList.contains("hand-card")&&card.cost>state.turn-usedEnergy()))return;
  pointerDrag={id,origin,startX:event.clientX,startY:event.clientY,active:false,ghost:null,pointerId:event.pointerId};
});
document.addEventListener("pointermove",event=>{
  if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
  const drag=pointerDrag;
  if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<7)return;
  if(!drag.active){
    drag.active=true;const holder=document.createElement("div");holder.innerHTML=handCard(cardById(drag.id));
    drag.ghost=holder.firstElementChild;drag.ghost.classList.remove("selected","unaffordable");drag.ghost.classList.add("drag-ghost");
    drag.ghost.removeAttribute("data-card-id");drag.ghost.setAttribute("aria-hidden","true");drag.ghost.tabIndex=-1;
    document.body.append(drag.ghost);drag.origin.classList.add("dragging-origin");
    $$(".lane").forEach(lane=>lane.classList.add("can-place"));
  }
  event.preventDefault();
  drag.ghost.style.left=`${event.clientX-38}px`;drag.ghost.style.top=`${event.clientY-40}px`;
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest("[data-lane]");
  $$(".lane").forEach(lane=>lane.classList.toggle("drag-over",lane===target));
},{passive:false});
function finishDrag(event,cancelled=false){
  if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;
  const drag=pointerDrag;pointerDrag=null;if(!drag.active)return;
  suppressClickUntil=Date.now()+350;
  const target=document.elementFromPoint(event.clientX,event.clientY),lane=target?.closest("[data-lane]");
  drag.ghost.remove();drag.origin.classList.remove("dragging-origin");
  $$(".lane").forEach(item=>item.classList.remove("drag-over","can-place"));
  if(cancelled)return renderBoard();
  if(lane)placeCard(drag.id,Number(lane.dataset.lane));else if(target?.closest("#hand"))removeCard(drag.id);else renderBoard();
}
document.addEventListener("pointerup",event=>finishDrag(event));
document.addEventListener("pointercancel",event=>finishDrag(event,true));
$("#app-dialog").addEventListener("click",event=>{
  const bounds=event.currentTarget.getBoundingClientRect();
  if(event.target===event.currentTarget&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))closeDialog();
});
$("#app-dialog").addEventListener("close",()=>{if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus();else $('[data-action="settings"]')?.focus();});
state.scenario=makeScenario();render();

