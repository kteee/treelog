import { useEffect, useRef, useState, type RefObject } from "react";
import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { loadDoc, saveDoc } from "../data/db";
import { READ_ONLY } from "../config";

const SAVE_DELAY = 400;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type EditorHandle = RefObject<BlockNoteEditor<any, any, any> | null>;

interface Props {
  nodeId: string;
  handle: EditorHandle;
  onError: (message: string) => void;
}

function readAsDataUrl(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    return Promise.reject(new Error("10MB가 넘는 파일은 넣을 수 없어요."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function DocEditor({ nodeId, handle, onError }: Props) {
  const [initial, setInitial] = useState<unknown[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadDoc(nodeId)
      .then((doc) => {
        if (!cancelled) setInitial(doc ?? null);
      })
      .catch(() => onError("문서를 불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [nodeId, onError]);

  if (initial === undefined) return null;
  return <LoadedEditor nodeId={nodeId} initial={initial} handle={handle} onError={onError} />;
}

interface LoadedProps extends Props {
  initial: unknown[] | null;
}

function LoadedEditor({ nodeId, initial, handle, onError }: LoadedProps) {
  const editor = useCreateBlockNote({
    initialContent: initial?.length ? (initial as PartialBlock[]) : undefined,
    dictionary: {
      ...ko,
      placeholders: { ...ko.placeholders, default: "내용을 입력하거나 / 를 눌러 블록을 고르세요" },
    },
    uploadFile: readAsDataUrl,
  });
  const pending = useRef<unknown[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => {
    handle.current = editor;
    return () => {
      handle.current = null;
    };
  }, [editor, handle]);

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      const blocks = pending.current;
      if (!blocks) return;
      pending.current = null;
      saveDoc(nodeId, blocks).catch(() => onError("문서를 저장하지 못했어요. 저장 공간을 확인해 주세요."));
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    flushRef.current = flush;
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [nodeId, onError]);

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      editable={!READ_ONLY}
      onChange={() => {
        pending.current = editor.document;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flushRef.current(), SAVE_DELAY);
      }}
    />
  );
}
