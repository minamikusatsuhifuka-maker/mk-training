// 担当者名の役割色付き表示（指示書57）
// リーダー=👑太字amber／サブ=⭐blue／メンバー=通常。役割未設定・単一担当は従来どおり。
// カード・各ビュー・タスク履歴で共通利用（文字列版は lib の formatAssignees）。

import { Fragment } from "react";
import {
  assigneesOf,
  roleOf,
  TASK_ROLE_STYLE,
  type StaffTask,
} from "@/lib/staff-tasks";

export function AssigneeNames({
  task,
}: {
  task: Pick<StaffTask, "assignee" | "assignees" | "taskRoles">;
}) {
  const names = assigneesOf(task);
  if (names.length === 0) return <>—</>;
  return (
    <>
      {names.map((n, i) => {
        const s = TASK_ROLE_STYLE[roleOf(task, n)];
        return (
          <Fragment key={n}>
            {i > 0 && "・"}
            <span className={s.text || undefined}>
              {s.icon}
              {n}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}
