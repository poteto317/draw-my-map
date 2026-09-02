import type { Application, Container, Graphics, Text } from "pixi.js";

export type PixiConstructors = {
  Graphics: typeof Graphics;
  Text: typeof Text;
  Container: typeof Container;
};

export type PixiRuntime = {
  app: Application;
  constructors: PixiConstructors;
};
