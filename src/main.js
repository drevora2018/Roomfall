import { Game } from "./game.js";
import { UIController } from "./ui/controller.js";

const ui = new UIController();
const game = new Game({
  canvas: ui.elements.canvas,
  ui,
  storage: window.localStorage,
});

ui.bind({
  onNewRun: () => game.startNewRun(),
  onContinueRun: () => game.continueRun(),
  onOpenHub: (tab) => game.openHub(tab),
  onCloseHub: () => game.closeHub(),
  onOpenPause: () => game.openPause(),
  onResume: () => game.resume(),
  onContinueRoom: () => game.continueToNextRoom(),
  onResetMeta: () => game.resetMetaProgress(),
  onToggleAudio: () => game.toggleAudio(),
  onBuyOffer: (index) => game.buyOffer(index),
  onBuySkill: (skillId) => game.buySkill(skillId),
  onTabChange: (tab) => {
    game.hubTab = tab;
  },
  onRerollShop: () => game.rerollShop(),
  onReturnMenu: () => game.returnToMenu(),
});

game.init();
