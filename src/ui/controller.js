import { SKILL_TREE } from "../config/skills.js";

export class UIController {
  constructor() {
    this.elements = {
      canvas: document.getElementById("game-canvas"),
      hudRoom: document.getElementById("hud-room"),
      hudHp: document.getElementById("hud-hp"),
      hudGold: document.getElementById("hud-gold"),
      hudShards: document.getElementById("hud-shards"),
      hudWeapon: document.getElementById("hud-weapon"),
      hudNextRoomButton: document.getElementById("hud-next-room-button"),
      menu: document.getElementById("menu-overlay"),
      hub: document.getElementById("hub-overlay"),
      pause: document.getElementById("pause-overlay"),
      gameOver: document.getElementById("game-over-overlay"),
      continueRunButton: document.getElementById("continue-run-button"),
      newRunButton: document.getElementById("new-run-button"),
      pauseNewRunButton: document.getElementById("pause-new-run-button"),
      retryButton: document.getElementById("retry-button"),
      returnMenuButton: document.getElementById("return-menu-button"),
      openHubButton: document.getElementById("open-hub-button"),
      openPauseButton: document.getElementById("open-pause-button"),
      closeHubButton: document.getElementById("close-hub-button"),
      continueRoomButton: document.getElementById("continue-room-button"),
      resumeButton: document.getElementById("resume-button"),
      resetProgressButton: document.getElementById("reset-progress-button"),
      toggleAudioButton: document.getElementById("toggle-audio-button"),
      rerollShopButton: document.getElementById("reroll-shop-button"),
      status: document.getElementById("hub-status"),
      hubCurrency: document.getElementById("hub-currency"),
      shopOffers: document.getElementById("shop-offers"),
      skillsTree: document.getElementById("skills-tree"),
      statsList: document.getElementById("stats-list"),
      mathList: document.getElementById("math-list"),
      skillsSummary: document.getElementById("skills-summary"),
      gameOverSummary: document.getElementById("game-over-summary"),
      tabButtons: Array.from(document.querySelectorAll(".tab-button")),
      panels: {
        shop: document.getElementById("hub-tab-shop"),
        skills: document.getElementById("hub-tab-skills"),
        stats: document.getElementById("hub-tab-stats"),
      },
    };
    this.lastOverlay = null;
    this.lastTab = "shop";
    this.lastShopSignature = "";
    this.lastSkillsSignature = "";
    this.lastStatsSignature = "";
  }

  bind(actions) {
    this.elements.newRunButton.addEventListener("click", actions.onNewRun);
    this.elements.pauseNewRunButton.addEventListener("click", actions.onNewRun);
    this.elements.retryButton.addEventListener("click", actions.onNewRun);
    this.elements.continueRunButton.addEventListener("click", actions.onContinueRun);
    this.elements.openHubButton.addEventListener("click", () => actions.onOpenHub("shop"));
    this.elements.hudNextRoomButton.addEventListener("click", actions.onContinueRoom);
    this.elements.openPauseButton.addEventListener("click", actions.onOpenPause);
    this.elements.closeHubButton.addEventListener("click", actions.onCloseHub);
    this.elements.continueRoomButton.addEventListener("click", actions.onContinueRoom);
    this.elements.resumeButton.addEventListener("click", actions.onResume);
    this.elements.returnMenuButton.addEventListener("click", actions.onReturnMenu);
    this.elements.resetProgressButton.addEventListener("click", actions.onResetMeta);
    this.elements.toggleAudioButton.addEventListener("click", actions.onToggleAudio);
    this.elements.rerollShopButton.addEventListener("click", actions.onRerollShop);

    this.elements.shopOffers.addEventListener("click", (event) => {
      const button = event.target.closest("[data-offer-index]");
      if (!button) {
        return;
      }
      actions.onBuyOffer(Number(button.dataset.offerIndex));
    });

    this.elements.skillsTree.addEventListener("click", (event) => {
      const button = event.target.closest("[data-skill-id]");
      if (!button) {
        return;
      }
      actions.onBuySkill(button.dataset.skillId);
    });

    for (const button of this.elements.tabButtons) {
      button.addEventListener("click", () => actions.onTabChange(button.dataset.tab));
    }
  }

  setOverlay(name) {
    const overlays = [
      this.elements.menu,
      this.elements.hub,
      this.elements.pause,
      this.elements.gameOver,
    ];
    for (const overlay of overlays) {
      overlay.classList.remove("overlay--visible");
    }
    if (name) {
      this.elements[name].classList.add("overlay--visible");
    }
    this.lastOverlay = name;
  }

  setActiveTab(tab) {
    this.lastTab = tab;
    for (const button of this.elements.tabButtons) {
      button.classList.toggle("tab-button--active", button.dataset.tab === tab);
    }
    for (const [name, panel] of Object.entries(this.elements.panels)) {
      panel.classList.toggle("tab-panel--active", name === tab);
    }
  }

  render(view) {
    this.elements.hudRoom.textContent = view.roomLabel;
    this.elements.hudHp.textContent = `${Math.ceil(view.hp)} / ${Math.ceil(view.maxHp)}`;
    this.elements.hudGold.textContent = String(view.gold);
    this.elements.hudShards.textContent = String(view.skillShards);
    this.elements.hudWeapon.textContent = view.weaponName;
    this.elements.continueRunButton.disabled = !view.canContinueRun;
    this.elements.continueRunButton.textContent = view.canContinueRun ? "Continue Run" : "No Saved Run";
    this.elements.continueRoomButton.disabled = !view.betweenRooms;
    this.elements.continueRoomButton.style.display = view.betweenRooms ? "inline-flex" : "none";
    this.elements.hudNextRoomButton.style.display = view.betweenRooms ? "inline-flex" : "none";
    this.elements.status.textContent = view.statusMessage;
    this.elements.skillsSummary.textContent = `${view.skillShards} Skill Shards available`;
    this.elements.toggleAudioButton.textContent = view.muted ? "Unmute Audio" : "Mute Audio";
    this.elements.gameOverSummary.textContent = view.gameOverSummary;
    this.elements.hubCurrency.innerHTML = `
      <div class="summary-chip">HP: ${Math.ceil(view.hp)} / ${Math.ceil(view.maxHp)}</div>
      <div class="summary-chip">Gold: ${view.gold}</div>
      <div class="summary-chip">Shards: ${view.skillShards}</div>
      <div class="summary-chip">Next Room: ${view.roomLabel}</div>
    `;

    this.setOverlay(view.overlay);
    this.setActiveTab(view.activeTab);

    this.renderShop(view.shopOffers, view.gold, view.rerollCost, view.canReroll);
    this.renderSkills(view.skills, view.skillShards);
    this.renderStats(view.stats, view.mathLines);
  }

  renderShop(offers, gold, rerollCost, canReroll) {
    const signature = JSON.stringify({ offers, gold, rerollCost, canReroll });
    if (signature === this.lastShopSignature) {
      return;
    }
    this.lastShopSignature = signature;
    this.elements.rerollShopButton.textContent = `Reroll (${rerollCost} Gold)`;
    this.elements.rerollShopButton.disabled = !canReroll;
    this.elements.shopOffers.innerHTML = offers
      .map((offer, index) => {
        const afford = offer.type === "soldOut" || gold >= offer.cost;
        const buttonLabel =
          offer.type === "soldOut"
            ? "Exhausted"
            : offer.purchased
              ? "Purchased"
              : gold >= offer.cost
                ? "Buy"
                : "Need More Gold";
        const detailLabel =
          offer.detailLabel ??
          (offer.type === "weapon"
            ? offer.rarity
            : offer.type === "perk"
              ? "Unique"
              : offer.type === "buff"
                ? "Stacking"
                : "Unavailable");
        return `
          <article class="shop-card">
            <h4>${offer.name}</h4>
            <p>${offer.description}</p>
            <div class="shop-card__meta">
              <span class="meta-chip">${offer.type === "soldOut" ? "perk slot" : offer.type}</span>
              <span class="meta-chip meta-chip--gold">${offer.type === "soldOut" ? "Sold Out" : `${offer.cost} Gold`}</span>
              <span class="meta-chip meta-chip--mint">${detailLabel}</span>
            </div>
            <button
              class="action-button ${afford ? "" : "action-button--secondary"}"
              data-offer-index="${index}"
              type="button"
              ${offer.type === "soldOut" || offer.purchased || !afford ? "disabled" : ""}
            >
              ${buttonLabel}
            </button>
          </article>
        `;
      })
      .join("");
  }

  renderSkills(skills, skillShards) {
    const signature = JSON.stringify({ skills, skillShards });
    if (signature === this.lastSkillsSignature) {
      return;
    }
    this.lastSkillsSignature = signature;
    const grouped = SKILL_TREE.reduce((result, skill) => {
      if (!result[skill.branch]) {
        result[skill.branch] = [];
      }
      result[skill.branch].push(skill);
      return result;
    }, {});
    this.elements.skillsTree.innerHTML = Object.entries(grouped)
      .map(([branch, branchSkills]) => {
        const cards = branchSkills
          .map((skill) => {
            const state = skills.find((entry) => entry.id === skill.id);
            return `
              <article class="skill-card">
                <h4>${skill.name}</h4>
                <p>${skill.description}</p>
                <div class="skill-card__meta">
                  <span class="meta-chip">Lv ${state.level}/${skill.maxLevel}</span>
                  <span class="meta-chip meta-chip--gold">${state.nextCost ?? "Maxed"} Shards</span>
                </div>
                <button
                  class="action-button ${state.canBuy ? "" : "action-button--secondary"}"
                  type="button"
                  data-skill-id="${skill.id}"
                  ${state.canBuy ? "" : "disabled"}
                >
                  ${state.canBuy ? `Buy (${state.nextCost})` : state.level >= skill.maxLevel ? "Maxed" : "Locked"}
                </button>
              </article>
            `;
          })
          .join("");

        return `
          <section class="skill-column">
            <div class="skill-column__header">
              <p class="eyebrow">${branch}</p>
              <h3>${branch}</h3>
            </div>
            ${cards}
          </section>
        `;
      })
      .join("");
    this.elements.skillsSummary.textContent = `${skillShards} Skill Shards available`;
  }

  renderStats(stats, mathLines) {
    const signature = JSON.stringify({ stats, mathLines });
    if (signature === this.lastStatsSignature) {
      return;
    }
    this.lastStatsSignature = signature;
    this.elements.statsList.innerHTML = `
      <ul>
        ${stats.map((line) => `<li>${line}</li>`).join("")}
      </ul>
    `;
    this.elements.mathList.innerHTML = `
      <ul>
        ${mathLines.map((line) => `<li>${line}</li>`).join("")}
      </ul>
    `;
  }
}
