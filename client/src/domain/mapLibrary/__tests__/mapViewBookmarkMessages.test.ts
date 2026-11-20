import {
  mapViewBookmarkDuplicateNameNotice,
  mapViewBookmarkEmptyNameNotice,
  mapViewBookmarkFailureNotice,
  mapViewBookmarkReadFailedNotice,
  mapViewBookmarkWriteFailedNotice,
} from "@/domain/mapLibrary/mapViewBookmarkMessages";

it("表示ブックマークの失敗通知文言を理由ごとに返す", () => {
  expect(mapViewBookmarkReadFailedNotice()).toEqual({
    kind: "error",
    message: "表示ブックマークを読み込めませんでした。",
  });
  expect(mapViewBookmarkEmptyNameNotice().message).toBe("表示ブックマーク名を入力してください。");
  expect(mapViewBookmarkDuplicateNameNotice().message).toBe("同じ名前の表示ブックマークがすでにあります。");
  expect(mapViewBookmarkWriteFailedNotice("save").message).toBe("表示ブックマークを保存できませんでした。");
  expect(mapViewBookmarkWriteFailedNotice("delete").message).toBe("表示ブックマークを削除できませんでした。");
  expect(mapViewBookmarkFailureNotice("empty-name", "save")).toEqual(mapViewBookmarkEmptyNameNotice());
  expect(mapViewBookmarkFailureNotice("duplicate-name", "delete")).toEqual(mapViewBookmarkDuplicateNameNotice());
  expect(mapViewBookmarkFailureNotice("write", "save")).toEqual(mapViewBookmarkWriteFailedNotice("save"));
  expect(mapViewBookmarkFailureNotice("read", "delete")).toEqual(mapViewBookmarkReadFailedNotice());
});
