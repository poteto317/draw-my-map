import type { Application } from "pixi.js";

export function clearMapScene(app: Application): void {
  for (const child of app.stage.removeChildren()) {
    child.destroy({ children: true, context: true });
  }
}
