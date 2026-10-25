// 動的な画面（サーバーで描く）の切り替え中のスケルトン。先読みでこの枠までは先に取れるので、押した瞬間に出る
import { RouteSkeleton } from "@/components/RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton />;
}
