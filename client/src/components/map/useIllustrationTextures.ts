"use client";

import { useEffect, useRef, useState } from "react";
import { loadIllustrationTexture } from "@/components/map/pixi/illustrationTextureLoader";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";
import type { Texture } from "pixi.js";

const NO_TEXTURES: ReadonlyMap<string, Texture> = new Map();

// runtime ごとの読み込み状態。nodes が変わっても読み込み中の結果を捨てないように、
// 破棄の判断（disposed）は effect の実行ごとではなく runtime ごとに持つ。
type TextureSession = {
  runtime: PixiRuntime;
  requested: Set<string>;
  textures: Map<string, Texture>;
  disposed: boolean;
};

type LoadedTextures = {
  runtime: PixiRuntime;
  textures: ReadonlyMap<string, Texture>;
};

export function useIllustrationTextures(
  runtime: PixiRuntime | null,
  nodes: readonly Node[],
): ReadonlyMap<string, Texture> {
  const [loaded, setLoaded] = useState<LoadedTextures | null>(null);
  const sessionRef = useRef<TextureSession | null>(null);

  // runtime が変わる・アンマウントするときは、その runtime のテクスチャを破棄する。
  // マップの置き換えで使われなくなったテクスチャは、枚数が少なく、ここで破棄されるので、その場では破棄しない。
  useEffect(() => {
    if (runtime === null) return;
    const session: TextureSession = {
      runtime,
      requested: new Set(),
      textures: new Map(),
      disposed: false,
    };
    sessionRef.current = session;
    return () => {
      session.disposed = true;
      session.textures.forEach((texture) => texture.destroy(true));
      session.textures.clear();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [runtime]);

  useEffect(() => {
    const session = sessionRef.current;
    if (runtime === null || session === null || session.runtime !== runtime) return;

    for (const node of nodes) {
      const url = node.illustration;
      if (url === undefined || session.requested.has(url)) continue;
      session.requested.add(url);
      loadIllustrationTexture(runtime.constructors.Texture, url).then(
        (texture) => {
          if (session.disposed) {
            texture.destroy(true);
            return;
          }
          session.textures.set(url, texture);
          setLoaded({ runtime, textures: new Map(session.textures) });
        },
        // 読み込めない画像は、イラストなしのままにする（再試行しない）
        () => {},
      );
    }
  }, [runtime, nodes]);

  return loaded !== null && loaded.runtime === runtime ? loaded.textures : NO_TEXTURES;
}
