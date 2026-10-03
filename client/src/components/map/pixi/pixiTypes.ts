import type { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

export type PixiConstructors = {
  Graphics: typeof Graphics;
  Text: typeof Text;
  Container: typeof Container;
  Sprite: typeof Sprite;
  Texture: typeof Texture;
};

export type PixiRuntime = {
  app: Application;
  constructors: PixiConstructors;
};
