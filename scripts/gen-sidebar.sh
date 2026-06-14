#!/bin/bash
# 生成 site/.vitepress/config/sidebar.ts —— 章→节嵌套侧边栏。
# 节标题取自各章目录页 chXX.md 里的 [N.M 标题](./chXX_N.md) 链接文本（最权威）。
# 重新生成：bash scripts/gen-sidebar.sh
cd "$(dirname "$0")/.." || exit 1

title_of() {
  case "$1" in
    01) echo "第 1 章 能量变换的艺术与代价";;
    02) echo "第 2 章 稳态变换器分析原理";;
    03) echo "第 3 章 稳态等效电路建模：损耗与效率";;
    04) echo "第 4 章 当理想开关遇到物理现实";;
    05) echo "第 5 章 当波形不再连续";;
    06) echo "第 6 章 变换器电路";;
    07) echo "第 7 章 交流等效电路建模";;
    08) echo "第 8 章 变换器传递函数";;
    09) echo "第 9 章 控制器设计";;
    10) echo "第 10 章 磁性基础理论";;
    11) echo "第 11 章 铜与铁的博弈";;
    12) echo "第 12 章 变压器设计：当磁芯开始发烫";;
    13) echo "第 13 章 面向设计的分析技术：反馈定理";;
    14) echo "第 14 章 电路平均法与平均开关模型";;
    15) echo "第 15 章 断续导通模式（DCM）的建模";;
    16) echo "第 16 章 额外元件定理";;
    17) echo "第 17 章 输入滤波器设计";;
    18) echo "第 18 章 电流编程控制（CPM）";;
    19) echo "第 19 章 数字控制的代价与力量";;
    20) echo "第 20 章 非正弦系统里的功率与谐波";;
    21) echo "第 21 章 脉宽调制整流器";;
    22) echo "第 22 章 谐振变换";;
    23) echo "第 23 章 软开关技术";;
  esac
}

groups=(
"起步：能量、效率与开关|01 02 03 04 05"
"变换器电路与建模|06 07 08 09"
"磁元件设计|10 11 12"
"面向设计的分析技术|13 14 15 16 17"
"闭环控制|18 19"
"谐波、整流与软开关|20 21 22 23"
)

mkdir -p site/.vitepress/config
out=site/.vitepress/config/sidebar.ts
{
echo "// 自动生成（bash scripts/gen-sidebar.sh）。章→节嵌套侧边栏；"
echo "// 节标题取自各章目录页 chXX.md 的 [N.M 标题](./chXX_N.md) 链接文本。"
echo "import type { SidebarItem } from 'vitepress'"
echo ""
echo "export const sidebar: SidebarItem[] = ["
for g in "${groups[@]}"; do
  gname="${g%%|*}"
  chs="${g#*|}"
  echo "  {"
  echo "    text: '$gname',"
  echo "    collapsed: false,"
  echo "    items: ["
  for ch in $chs; do
    ct="$(title_of "$ch")"
    echo "      {"
    echo "        text: '$ct',"
    echo "        collapsed: true,"
    echo "        items: ["
    echo "          { text: '章节概览', link: '/power-electronics/ch$ch' },"
    # 提取该章目录页里的节链接：[标题](./chXX_N.md)
    grep -oE '\[[^]]+\]\(\./ch'"$ch"'_[0-9]+\.md\)' "tutorials/power-electronics/ch$ch.md" 2>/dev/null | while IFS= read -r link; do
      txt="${link#\[}"; txt="${txt%%\]*}"
      sec="${link##*(./}"; sec="${sec%%.md\)*}"
      txt="${txt//\'/’}"   # 单引号转全角，避免破坏 TS 字符串
      echo "          { text: '$txt', link: '/power-electronics/$sec' },"
    done
    echo "        ],"
    echo "      },"
  done
  echo "    ],"
  echo "  },"
done
echo "]"
} > "$out"

echo "✅ 生成 $out"
echo "总行数: $(wc -l < "$out")"
echo "节条目数(含概览): $(grep -cE "link: '/power-electronics/ch[0-9]" "$out")"
