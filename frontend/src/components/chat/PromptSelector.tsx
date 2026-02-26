"use client";

export function PromptSelector() {
  return (
    <select className="rounded border border-slate-300 px-3 py-2">
      <option>论文详解</option>
      <option>方法分析</option>
      <option>实验对比</option>
    </select>
  );
}
