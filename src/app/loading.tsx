// 全画面の切り替え中のスケルトン（先読みされ、押した瞬間に出る。動的な画面もこの枠までは先に取れる）
import { RouteSkeleton } from "@/components/RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton />;
}
