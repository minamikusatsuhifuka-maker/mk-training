// 🎯 等級制度：同心円で見る5つの等級（指示書209）
//
// 【文言の出典】新しい言い回しは作らない（歯止め4）。使っているのは次の原文だけ。
//   ・等級名「G1 ルーキー ／ G2 コア ／ G3 リーダー ★ ／ G4 パートナー ／ G5 アンバサダー」
//       … data/hr-portal.ts HR_GRADE_SECTIONS[five-grades]
//   ・「技能の時代」「在り方の時代」
//       … 同 [what-is-grade]「G1・G2は「技能の時代」、G3・G4・G5は「在り方の時代」」
//   ・同心円の範囲（自分・同期／チーム／クリニック全体／部門・組織・採用候補者／業界・地域・社会・次世代）
//       … 同 [overview]「同心円の広がり」列（移行ごと）と、
//         data/growth-matrix-v1.json 3-2 マインドの「視座」列（M3 クリニック全体／
//         M4 部門・組織・採用候補者／M5 業界・地域・社会・次世代）。
//         指示書209 §2 が、これを**等級ごと**に並べ直したもの。
//   ・「G2→G3 ★ 質的転換点」
//       … 同 [overview]「当院のキャリアで最も大きな質的転換点は G2→G3」＋表の「G2→G3 ★」
//   ・図の下の一文 … コーポレートブック 2-4（指示書209 §2 に全文）
//
// 【作り】SVGをその場に書く（画像ファイル・外部読み込みなし）。
//   パソコン＝図の右に引き出し線つきの一覧／スマートフォン＝図の下に色見本つきの一覧。
//   **円の中には文字を置かない**（重なりを作らないため・209 §3）。
//   読み上げ用の本文は1つだけ持ち、スマートフォンでは見える一覧、パソコンでは
//   `md:sr-only` で読み上げ専用にする（同じ内容を二重に読ませない）。
//   色は中心ほど淡く外側ほど濃い**一方向の濃淡**にしてあるので、白黒で印刷しても順序が分かる。

/** 中心をそろえた**本当の同心円**（「同心円が広がる」という考え方そのままの形にする） */
const CX = 175;
const CY = 190;

type Grade = {
  id: string;
  /** 等級の呼び名（出典どおり） */
  name: string;
  /** 同心円の範囲（出典どおり） */
  scope: string;
  r: number;
  fill: string;
  stroke: string;
  /** G2→G3 の境目（点線で示す） */
  dashed?: boolean;
};

/** 内側（G1）から外側（G5）へ。描くときは外側から重ねる */
const GRADES: Grade[] = [
  { id: "G1", name: "G1 ルーキー", scope: "自分・同期", r: 34, fill: "#ecfdf5", stroke: "#34d399" },
  { id: "G2", name: "G2 コア", scope: "チーム", r: 64, fill: "#bbf7d0", stroke: "#059669", dashed: true },
  { id: "G3", name: "G3 リーダー ★", scope: "クリニック全体", r: 94, fill: "#5eead4", stroke: "#0d9488" },
  { id: "G4", name: "G4 パートナー", scope: "部門・組織・採用候補者", r: 124, fill: "#2dd4bf", stroke: "#0f766e" },
  { id: "G5", name: "G5 アンバサダー", scope: "業界・地域・社会・次世代", r: 154, fill: "#0d9488", stroke: "#134e4a" },
];

const SKILL_ERA = "技能の時代";
const BEING_ERA = "在り方の時代";
const TURNING_POINT = "G2→G3 ★ 質的転換点";
/** コーポレートブック 2-4（そのまま載せる） */
const BOOK_2_4 =
  "「昇格」は階段を上るイメージで、上下関係を含みます。一方、「ネクストステージへの移行」は同心円が広がるイメージです。";

/** 外側から描く＝内側の円が上に乗って、中心ほど淡い帯になる */
function Circles({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {[...GRADES].reverse().map((g) => (
        <circle
          key={g.id}
          cx={cx}
          cy={cy}
          r={g.r}
          fill={g.fill}
          stroke={g.stroke}
          strokeWidth={g.dashed ? 2.5 : 1.5}
          strokeDasharray={g.dashed ? "7 5" : undefined}
        />
      ))}
    </>
  );
}

/** パソコン用：図の右に、各円の等級と範囲を引き出し線で示す */
function WideFigure() {
  // 一覧の行の高さ。引き出し線は**中心から見て放射状**に引く（同心円なので、これが最短で迷わない）
  const slot: Record<string, number> = { G5: 44, G4: 104, G3: 164, G2: 268, G1: 328 };
  const LABEL_X = 372;
  return (
    <svg viewBox="0 0 620 380" className="w-full h-auto" aria-hidden="true">
      <Circles cx={CX} cy={CY} />
      {GRADES.map((g) => {
        const y = slot[g.id];
        const tx = LABEL_X - 16;
        const dx = tx - CX;
        const dy = y - CY;
        const len = Math.hypot(dx, dy);
        // その円の上で、一覧の行にいちばん近い点から引く
        const sx = CX + (dx / len) * g.r;
        const sy = CY + (dy / len) * g.r;
        return (
          <g key={g.id}>
            <line
              x1={sx}
              y1={sy}
              x2={LABEL_X - 10}
              y2={y - 4}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={sx} cy={sy} r={3.5} fill={g.stroke} />
            <text x={LABEL_X} y={y} fontSize={14} fontWeight={700} fill="#0f172a">
              {g.name}
            </text>
            <text x={LABEL_X} y={y + 18} fontSize={12.5} fill="#334155">
              {g.scope}
            </text>
          </g>
        );
      })}

      {/* 時代の分かれ目（色の系統の違い）と、G2→G3 の質的転換点 */}
      <text x={LABEL_X} y={18} fontSize={11.5} fontWeight={700} fill="#0f766e">
        {BEING_ERA}
      </text>
      <line x1={LABEL_X} y1={200} x2={600} y2={200} stroke="#059669" strokeWidth={1.5} strokeDasharray="7 5" />
      <text x={LABEL_X} y={218} fontSize={12} fontWeight={700} fill="#047857">
        {TURNING_POINT}
      </text>
      <text x={LABEL_X} y={246} fontSize={11.5} fontWeight={700} fill="#047857">
        {SKILL_ERA}
      </text>
    </svg>
  );
}

/** スマートフォン用：円だけ（文字は入れない）。中身は下の一覧で読む */
function NarrowFigure() {
  return (
    <svg viewBox="0 0 350 350" className="w-full h-auto max-w-[320px] mx-auto" aria-hidden="true">
      <Circles cx={175} cy={175} />
    </svg>
  );
}

export function GradeCirclesFigure() {
  return (
    <section
      id="concentric-circles"
      className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-3 scroll-mt-4"
    >
      <h2 className="text-sm font-bold text-gray-800">同心円で見る5つの等級</h2>

      <p className="text-xs text-gray-600">中心がG1で、外側ほど上の等級。</p>

      <div className="hidden md:block">
        <WideFigure />
      </div>
      <div className="md:hidden">
        <NarrowFigure />
      </div>

      {/* 図の内容を文字でも読めるようにする（209 §3）。
          スマートフォンでは見える一覧、パソコンでは読み上げ専用（図の右の一覧と二重にしない） */}
      <div className="md:sr-only space-y-3" data-grade-circles-list>
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-teal-800">{BEING_ERA}</p>
          <ul className="space-y-1.5">
            {[...GRADES].reverse().filter((g) => g.id !== "G1" && g.id !== "G2").map((g) => (
              <li key={g.id} className="flex items-start gap-2 text-sm text-gray-800">
                <span
                  className="mt-1 inline-block w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: g.fill, border: `1.5px solid ${g.stroke}` }}
                  aria-hidden="true"
                />
                <span>
                  <span className="font-bold">{g.name}</span>
                  <span className="text-gray-600">（{g.scope}）</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs font-bold text-emerald-800 border-t border-dashed border-emerald-500 pt-2">
          {TURNING_POINT}
        </p>

        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-emerald-800">{SKILL_ERA}</p>
          <ul className="space-y-1.5">
            {[...GRADES].filter((g) => g.id === "G2" || g.id === "G1").reverse().map((g) => (
              <li key={g.id} className="flex items-start gap-2 text-sm text-gray-800">
                <span
                  className="mt-1 inline-block w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: g.fill, border: `1.5px solid ${g.stroke}` }}
                  aria-hidden="true"
                />
                <span>
                  <span className="font-bold">{g.name}</span>
                  <span className="text-gray-600">（{g.scope}）</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* コーポレートブック 2-4（そのまま） */}
      <p className="text-sm text-gray-700 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
        {BOOK_2_4}
      </p>
    </section>
  );
}
