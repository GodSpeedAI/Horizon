/**
 * The Clack-style renderer for the sequential controller.
 *
 * This file owns presentation and key translation only. Every question, option, disabled state
 * and review line comes from `controller.ts`; the component cannot widen availability, invent a
 * gate or execute an intent. Submitting calls the injected `onIntent`, which is where the host
 * decides whether to request another frame or hand the intent to the capability path.
 */
import { useRef, useState } from "react";
import {
  applySequential,
  type SequentialIntent,
  type SequentialPrompt,
  type SequentialSession,
} from "./controller.ts";
import { Confirm, Select, ThemeProvider, type SelectOption } from "./vendor/terminal-ui/index.js";

export interface SequentialTerminalProps {
  readonly initialSession: SequentialSession;
  readonly onIntent: (intent: SequentialIntent) => void;
  readonly onExit: () => void;
}

function summaryLines(prompt: SequentialPrompt): string[] {
  return [
    `world ${prompt.context.world_ref} · checkpoint ${prompt.context.checkpoint_ref ?? "unknown"}`,
    `focus ${prompt.context.focus_ref}${prompt.context.case_ref === null ? "" : ` · case ${prompt.context.case_ref}`} · ${prompt.context.view_mode}`,
    ...prompt.body,
  ];
}

function optionsOf(prompt: SequentialPrompt): SelectOption<string>[] {
  if (prompt.kind === "review") return [];
  return prompt.options.map((option) => ({
    value: option.id,
    label: option.label,
    ...(option.hint === undefined ? {} : { hint: option.hint }),
    disabled: option.disabled,
  }));
}

function initialIndexOf(prompt: SequentialPrompt, options: readonly SelectOption<string>[]): number {
  if (prompt.kind === "review") return 0;
  const id = prompt.initial_choice_id;
  if (id === null) return 0;
  const index = options.findIndex((option) => option.value === id);
  return index === -1 ? 0 : index;
}

export function SequentialTerminal({ initialSession, onIntent, onExit }: SequentialTerminalProps) {
  const [session, setSession] = useState(initialSession);
  const sessionRef = useRef(initialSession);

  function dispatch(command: Parameters<typeof applySequential>[1]): void {
    const transition = applySequential(sessionRef.current, command);
    sessionRef.current = transition.session;
    setSession(transition.session);
    if (transition.intent !== null) onIntent(transition.intent);
  }

  const prompt = session.prompt;
  const lines = summaryLines(prompt);

  return (
    <ThemeProvider theme="clack">
      <box flexDirection="column" width="100%">
        {lines.map((line, index) => (
          <text key={`context-${index}`}>{line}</text>
        ))}
        {prompt.kind === "choice"
          ? prompt.blocked
              .filter((entry) => entry.next_step !== undefined)
              .map((entry, index) => (
                <text key={`next-${index}`}>{`${entry.label}: next ${entry.next_step}`}</text>
              ))
          : null}
        {prompt.kind === "review" ? (
          <Confirm
            key={`review:${prompt.frame_id}:${prompt.revision}:${prompt.operation_ref}`}
            message={prompt.question}
            labels={{ yes: "Confirm intent", no: "Not yet" }}
            onSubmit={(value) => {
              if (value) dispatch({ type: "confirm", frame_id: prompt.frame_id, revision: prompt.revision });
              else dispatch({ type: "cancel_review" });
            }}
            onCancel={() => dispatch({ type: "cancel_review" })}
          />
        ) : (
          <Select
            key={`${prompt.kind}:${prompt.frame_id}:${prompt.revision}:${prompt.question}`}
            message={prompt.question}
            options={optionsOf(prompt)}
            initialIndex={initialIndexOf(prompt, optionsOf(prompt))}
            maxVisible={12}
            onSubmit={(choice) => {
              if (choice === "ui:back") dispatch({ type: "back" });
              else if (choice === "ui:resume") dispatch({ type: "resume" });
              else dispatch({ type: "select", choice_id: choice, frame_id: prompt.frame_id, revision: prompt.revision });
            }}
            onCancel={() => {
              if (prompt.kind === "notice" && prompt.tone === "cancelled") onExit();
              else dispatch({ type: "cancel" });
            }}
          />
        )}
      </box>
    </ThemeProvider>
  );
}
