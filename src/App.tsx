import { useMemo, useState } from "react";
import "./App.css";

type ModelType = "Mealy" | "Moore";
type FFType = "JK" | "D";

type StateRow = {
  present: string;
  input: string;
  next: string;
  output: string;
};

type Equation = {
  flipflop: string;
  inputName: string;
  expression: string;
  minterms: string[];
  dontCares: string[];
  variables: string[];
};

const exampleRows: StateRow[] = [
  { present: "A", input: "0", next: "A", output: "0" },
  { present: "A", input: "1", next: "B", output: "0" },
  { present: "B", input: "0", next: "C", output: "1" },
  { present: "B", input: "1", next: "A", output: "0" },
  { present: "C", input: "0", next: "A", output: "1" },
  { present: "C", input: "1", next: "C", output: "1" },
];

function parseVariables(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function binaryCode(index: number, bits: number): string {
  return index.toString(2).padStart(bits, "0");
}

function allBinaryStrings(length: number): string[] {
  if (length === 0) return [""];
  const smaller = allBinaryStrings(length - 1);
  return smaller.flatMap((s) => ["0" + s, "1" + s]);
}

function combinePattern(a: string, b: string): string | null {
  let diff = 0;
  let result = "";

  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) {
      result += a[i];
    } else if (a[i] !== "-" && b[i] !== "-") {
      diff++;
      result += "-";
    } else {
      return null;
    }
  }

  return diff === 1 ? result : null;
}

function covers(pattern: string, minterm: string): boolean {
  return pattern
    .split("")
    .every((ch, i) => ch === "-" || ch === minterm[i]);
}

function patternToExpression(pattern: string, variables: string[]): string {
  const terms: string[] = [];

  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "1") terms.push(variables[i]);
    if (pattern[i] === "0") terms.push(`${variables[i]}'`);
  }

  return terms.length === 0 ? "1" : terms.join(" · ");
}

function simplifySOP(
  minterms: string[],
  dontCares: string[],
  variables: string[]
): string {
  const cleanMinterms = unique(minterms);
  const cleanDontCares = unique(dontCares);

  if (cleanMinterms.length === 0) return "0";

  const allTerms = unique([...cleanMinterms, ...cleanDontCares]);
  if (allTerms.length === Math.pow(2, variables.length)) return "1";

  let current = allTerms;
  const primeSet = new Set<string>();

  while (current.length > 0) {
    const used = new Set<string>();
    const nextSet = new Set<string>();

    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const combined = combinePattern(current[i], current[j]);
        if (combined) {
          used.add(current[i]);
          used.add(current[j]);
          nextSet.add(combined);
        }
      }
    }

    for (const term of current) {
      if (!used.has(term)) {
        primeSet.add(term);
      }
    }

    const next = Array.from(nextSet);
    if (next.length === 0) break;
    current = next;
  }

  const primes = Array.from(primeSet);
  const remaining = new Set(cleanMinterms);
  const selected: string[] = [];

  while (remaining.size > 0) {
    let foundEssential = false;

    for (const m of Array.from(remaining)) {
      const candidates = primes.filter((p) => covers(p, m));

      if (candidates.length === 1) {
        const essential = candidates[0];

        if (!selected.includes(essential)) {
          selected.push(essential);
        }

        for (const target of Array.from(remaining)) {
          if (covers(essential, target)) {
            remaining.delete(target);
          }
        }

        foundEssential = true;
      }
    }

    if (foundEssential) continue;

    let bestPrime = "";
    let bestCount = -1;

    for (const p of primes) {
      const count = Array.from(remaining).filter((m) => covers(p, m)).length;
      if (count > bestCount) {
        bestPrime = p;
        bestCount = count;
      }
    }

    if (!bestPrime) break;

    selected.push(bestPrime);

    for (const target of Array.from(remaining)) {
      if (covers(bestPrime, target)) {
        remaining.delete(target);
      }
    }
  }

  return unique(selected)
    .map((p) => patternToExpression(p, variables))
    .join(" + ");
}

function generateDesign(
  rows: StateRow[],
  inputVariablesText: string,
  ffType: FFType
) {
  const validRows = rows.filter(
    (r) => r.present.trim() && r.input.trim() && r.next.trim()
  );

  if (validRows.length === 0) {
    throw new Error("請至少輸入一列完整的狀態表。");
  }

  const inputVariables = parseVariables(inputVariablesText);

  if (inputVariables.length === 0) {
    throw new Error("請輸入至少一個 input variable，例如 X。");
  }

  const stateNames = unique(
    validRows.flatMap((r) => [r.present.trim(), r.next.trim()])
  );

  const stateBitCount = Math.max(1, Math.ceil(Math.log2(stateNames.length)));

  const stateCodes: Record<string, string> = {};
  stateNames.forEach((state, index) => {
    stateCodes[state] = binaryCode(index, stateBitCount);
  });

  const stateVariables = Array.from({ length: stateBitCount }, (_, i) => {
    return `Q${stateBitCount - 1 - i}`;
  });

  const allVariables = [...stateVariables, ...inputVariables];

  const usedCombinations: string[] = [];
  const rowInfo = validRows.map((row) => {
    const presentCode = stateCodes[row.present.trim()];
    const nextCode = stateCodes[row.next.trim()];
    const inputCode = row.input.replace(/[,\s]+/g, "");

    if (!/^[01]+$/.test(inputCode)) {
      throw new Error(`Input 欄位只能輸入 0/1，目前錯誤值：${row.input}`);
    }

    if (inputCode.length !== inputVariables.length) {
      throw new Error(
        `Input 欄位長度需等於 input variables 數量。你有 ${inputVariables.length} 個 input variable，但輸入了 ${row.input}`
      );
    }

    const combination = presentCode + inputCode;
    usedCombinations.push(combination);

    return {
      ...row,
      presentCode,
      nextCode,
      inputCode,
      combination,
    };
  });

  const allCombinations = allBinaryStrings(allVariables.length);
  const unusedCombinations = allCombinations.filter(
    (combo) => !usedCombinations.includes(combo)
  );

  const equations: Equation[] = [];

  for (let bitIndex = 0; bitIndex < stateBitCount; bitIndex++) {
    const label = stateBitCount - 1 - bitIndex;

    if (ffType === "D") {
      const minterms: string[] = [];
      const dontCares: string[] = [...unusedCombinations];

      for (const row of rowInfo) {
        if (row.nextCode[bitIndex] === "1") {
          minterms.push(row.combination);
        }
      }

      equations.push({
        flipflop: `FF for Q${label}`,
        inputName: `D${label}`,
        expression: simplifySOP(minterms, dontCares, allVariables),
        minterms,
        dontCares,
        variables: allVariables,
      });
    }

    if (ffType === "JK") {
      const jMinterms: string[] = [];
      const jDontCares: string[] = [...unusedCombinations];

      const kMinterms: string[] = [];
      const kDontCares: string[] = [...unusedCombinations];

      for (const row of rowInfo) {
        const q = row.presentCode[bitIndex];
        const qNext = row.nextCode[bitIndex];

        // JK excitation table
        if (q === "0" && qNext === "1") jMinterms.push(row.combination);
        if (q === "1") jDontCares.push(row.combination);

        if (q === "1" && qNext === "0") kMinterms.push(row.combination);
        if (q === "0") kDontCares.push(row.combination);
      }

      equations.push({
        flipflop: `FF for Q${label}`,
        inputName: `J${label}`,
        expression: simplifySOP(jMinterms, jDontCares, allVariables),
        minterms: jMinterms,
        dontCares: jDontCares,
        variables: allVariables,
      });

      equations.push({
        flipflop: `FF for Q${label}`,
        inputName: `K${label}`,
        expression: simplifySOP(kMinterms, kDontCares, allVariables),
        minterms: kMinterms,
        dontCares: kDontCares,
        variables: allVariables,
      });
    }
  }

return {
  stateNames,
  stateCodes,
  stateVariables,
  inputVariables,
  ffType,
  equations,
  transitions: rowInfo.map((row) => ({
    present: row.present.trim(),
    input: row.input.trim(),
    next: row.next.trim(),
    output: row.output.trim(),
  })),
};
}

function shortText(text: string, maxLength = 34): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function splitExpression(expression: string): string[][] {
  if (expression === "0" || expression === "1") {
    return [[expression]];
  }

  return expression
    .split("+")
    .map((term) =>
      term
        .trim()
        .split("·")
        .map((factor) => factor.trim())
        .filter(Boolean)
    )
    .filter((term) => term.length > 0);
}

function AndGate({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <path
        d={`M ${x} ${y}
            L ${x + 38} ${y}
            Q ${x + 76} ${y + 24} ${x + 38} ${y + 48}
            L ${x} ${y + 48} Z`}
        className="gate-shape"
      />
      <text x={x + 38} y={y + 30} textAnchor="middle" className="gate-text">
        AND
      </text>
      <text x={x + 38} y={y + 70} textAnchor="middle" className="gate-caption">
        {shortText(label, 22)}
      </text>
    </g>
  );
}

function OrGate({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <path
        d={`M ${x} ${y}
            Q ${x + 22} ${y + 24} ${x} ${y + 48}
            Q ${x + 58} ${y + 48} ${x + 90} ${y + 24}
            Q ${x + 58} ${y} ${x} ${y}`}
        className="gate-shape"
      />
      <text x={x + 47} y={y + 30} textAnchor="middle" className="gate-text">
        OR
      </text>
      <text x={x + 45} y={y + 70} textAnchor="middle" className="gate-caption">
        {shortText(label, 24)}
      </text>
    </g>
  );
}

function NotGate({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <path
        d={`M ${x} ${y} L ${x} ${y + 26} L ${x + 32} ${y + 13} Z`}
        className="gate-shape"
      />
      <circle cx={x + 40} cy={y + 13} r="5" className="gate-shape" />
      <text x={x + 52} y={y + 18} className="gate-caption">
        {label}'
      </text>
    </g>
  );
}

function grayCodes(bits: number): string[] {
  if (bits === 0) return [""];
  if (bits === 1) return ["0", "1"];

  const previous = grayCodes(bits - 1);

  return [
    ...previous.map((code) => "0" + code),
    ...previous
      .slice()
      .reverse()
      .map((code) => "1" + code),
  ];
}

function getKMapValue(eq: Equation, combination: string): string {
  if (eq.minterms.includes(combination)) return "1";
  if (eq.dontCares.includes(combination)) return "X";
  return "0";
}

function KMapTable({ equation }: { equation: Equation }) {
  const variableCount = equation.variables.length;

  if (variableCount < 2 || variableCount > 4) {
    return (
      <div className="kmap-card">
        <h4>K-map for {equation.inputName}</h4>
        <p className="hint">
          K-map preview currently supports 2 to 4 variables.
        </p>
      </div>
    );
  }

  const rowVariableCount = Math.floor(variableCount / 2);
  const colVariableCount = variableCount - rowVariableCount;

  const rowVariables = equation.variables.slice(0, rowVariableCount);
  const colVariables = equation.variables.slice(rowVariableCount);

  const rowCodes = grayCodes(rowVariableCount);
  const colCodes = grayCodes(colVariableCount);

  return (
    <div className="kmap-card">
      <h4>
        K-map for {equation.inputName}: {equation.inputName} ={" "}
        {equation.expression}
      </h4>

      <table className="kmap-table">
        <thead>
          <tr>
            <th>
              {rowVariables.join("")}\{colVariables.join("")}
            </th>
            {colCodes.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rowCodes.map((row) => (
            <tr key={row}>
              <th>{row}</th>

              {colCodes.map((col) => {
                const combination = row + col;
                const value = getKMapValue(equation, combination);

                return (
                  <td
                    key={combination}
                    className={
                      value === "1"
                        ? "kmap-one"
                        : value === "X"
                        ? "kmap-dontcare"
                        : ""
                    }
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="kmap-note">
        Variables order: {equation.variables.join(", ")}. X means don't-care.
      </p>
    </div>
  );
}

function KMapPreview({ equations }: { equations: Equation[] }) {
  return (
    <div className="kmap-section">
      <h3>K-map Preview</h3>

      <div className="kmap-grid">
        {equations.map((eq) => (
          <KMapTable key={eq.inputName} equation={eq} />
        ))}
      </div>
    </div>
  );
}

function CircuitDiagram({
  design,
  outputVariables,
}: {
  design: ReturnType<typeof generateDesign>;
  outputVariables: string;
}) {
  const width = 1240;

  const inputVariables = design.inputVariables;
  const stateVariables = design.stateVariables;
  const equations = design.equations;
  const outputText = parseVariables(outputVariables).join(", ") || "Z";

  const allFactors = equations.flatMap((eq) => splitExpression(eq.expression).flat());

  const inputX1 = 60;
  const inputX2 = 310;
  const inputY0 = 90;
  const inputGap = 74;

  const gateX = 365;
  const orX = 595;
  const ffX = 885;
  const ffW = 155;
  const ffH = design.ffType === "JK" ? 132 : 98;

  const feedbackRightX = 1130;
  const feedbackReturnX = 315;

  const equationY0 = 300;
  const equationGap = 190;
  const termGap = 64;

  const height = Math.max(780, equationY0 + equations.length * equationGap + 260);

  const outputBlockY = height - 205;
  const clockY = height - 62;

  const sourcePositions: Record<string, { x: number; y: number }> = {};

  inputVariables.forEach((input, index) => {
    const y = inputY0 + index * inputGap;
    sourcePositions[input] = { x: inputX2, y };

    if (allFactors.includes(`${input}'`)) {
      sourcePositions[`${input}'`] = { x: inputX2, y: y + 34 };
    }
  });

  function getEquationY(eqIndex: number) {
    return equationY0 + eqIndex * equationGap;
  }

  function getFfIndexByInput(inputName: string) {
    const qNumber = inputName.replace(/[A-Z]/g, "");
    return stateVariables.findIndex((q) => q.replace("Q", "") === qNumber);
  }

  function getInputPinOffset(inputName: string) {
    if (design.ffType === "D") return 56;
    if (inputName.startsWith("J")) return 48;
    return 100;
  }

  function getFfY(q: string) {
    const qNumber = q.replace("Q", "");

    const related = equations
      .map((eq, index) => ({ eq, index }))
      .filter(({ eq }) => eq.inputName.endsWith(qNumber));

    if (related.length === 0) return equationY0;

    const yList = related.map(({ eq, index }) => {
      return getEquationY(index) + 24 - getInputPinOffset(eq.inputName);
    });

    return yList.reduce((sum, y) => sum + y, 0) / yList.length;
  }

  function getInputPinY(inputName: string) {
    const ffIndex = getFfIndexByInput(inputName);
    if (ffIndex < 0) return equationY0;

    const q = stateVariables[ffIndex];
    return getFfY(q) + getInputPinOffset(inputName);
  }

  function getQOutputY(q: string) {
    return getFfY(q) + 48;
  }

  function getQBarOutputY(q: string) {
    return getFfY(q) + 76;
  }

  function getFeedbackLaneY(signal: string) {
    const base = signal.replace("'", "");
    const qIndex = stateVariables.indexOf(base);
    const isBar = signal.endsWith("'");

    return 150 + qIndex * 60 + (isBar ? 26 : 0);
  }

  stateVariables.forEach((q) => {
    sourcePositions[q] = {
      x: feedbackReturnX,
      y: getFeedbackLaneY(q),
    };

    sourcePositions[`${q}'`] = {
      x: feedbackReturnX,
      y: getFeedbackLaneY(`${q}'`),
    };
  });

  function getSource(factor: string) {
    return sourcePositions[factor] ?? { x: inputX2, y: inputY0 };
  }

  return (
    <div className="diagram-wrapper">
      <svg
        className="circuit-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sequential circuit diagram"
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#222" />
          </marker>

          <marker
            id="feedbackArrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#555" />
          </marker>
        </defs>

        <text x="40" y="35" className="svg-title">
          Output 2: Sequential Circuit Diagram ({design.ffType}-FF)
        </text>

        {/* External input X */}
        {inputVariables.map((input, index) => {
          const y = inputY0 + index * inputGap;
          const needComplement = allFactors.includes(`${input}'`);

          return (
            <g key={input}>
              <text x="40" y={y + 5} className="signal-label">
                {input}
              </text>

              <line
                x1={inputX1}
                y1={y}
                x2={inputX2}
                y2={y}
                className="main-signal-wire"
                markerEnd="url(#arrow)"
              />

              {needComplement && (
                <>
                  <line
                    x1={inputX1 + 40}
                    y1={y}
                    x2={inputX1 + 40}
                    y2={y + 34}
                    className="thin-wire"
                  />
                  <NotGate x={inputX1 + 58} y={y + 21} label={input} />
                  <line
                    x1={inputX1 + 102}
                    y1={y + 34}
                    x2={inputX2}
                    y2={y + 34}
                    className="thin-wire"
                    markerEnd="url(#arrow)"
                  />
                </>
              )}
            </g>
          );
        })}

        {/* Clear feedback return lanes */}
        {stateVariables.map((q) => {
          const qLaneY = getFeedbackLaneY(q);
          const qBarLaneY = getFeedbackLaneY(`${q}'`);

          return (
            <g key={`feedback-lane-${q}`}>
              <text x={feedbackReturnX - 42} y={qLaneY + 5} className="feedback-label">
                {q}
              </text>

              <line
                x1={feedbackRightX}
                y1={qLaneY}
                x2={feedbackReturnX}
                y2={qLaneY}
                className="feedback-lane"
                markerEnd="url(#feedbackArrow)"
              />

              <text x={feedbackReturnX - 42} y={qBarLaneY + 5} className="feedback-label">
                {q}'
              </text>

              <line
                x1={feedbackRightX}
                y1={qBarLaneY}
                x2={feedbackReturnX}
                y2={qBarLaneY}
                className="feedback-lane"
                markerEnd="url(#feedbackArrow)"
              />
            </g>
          );
        })}

        <text x={feedbackReturnX + 18} y="128" className="svg-note">
          feedback return from FF outputs
        </text>

        {/* Logic gates */}
        {equations.map((eq, eqIndex) => {
          const rowY = getEquationY(eqIndex);
          const pinY = getInputPinY(eq.inputName);
          const terms = splitExpression(eq.expression);

          return (
            <g key={eq.inputName}>
              <text x={gateX} y={rowY - 36} className="equation-label">
                {eq.inputName} = {shortText(eq.expression, 54)}
              </text>

              {eq.expression === "0" || eq.expression === "1" ? (
                <>
                  <circle cx={gateX + 42} cy={rowY + 24} r="18" className="const-node" />
                  <text
                    x={gateX + 42}
                    y={rowY + 30}
                    textAnchor="middle"
                    className="gate-text"
                  >
                    {eq.expression}
                  </text>

                  <line
                    x1={gateX + 60}
                    y1={rowY + 24}
                    x2={ffX}
                    y2={pinY}
                    className="svg-wire"
                    markerEnd="url(#arrow)"
                  />
                </>
              ) : (
                <>
                  {terms.map((term, termIndex) => {
                    const gateY = rowY + termIndex * termGap;
                    const termLabel = term.join("·");

                    return (
                      <g key={`${eq.inputName}-term-${termIndex}`}>
                        <AndGate x={gateX} y={gateY} label={termLabel} />

                        {term.map((factor, factorIndex) => {
                          const source = getSource(factor);
                          const routeX = gateX - 72 - factorIndex * 22;
                          const targetY = gateY + 12 + factorIndex * 16;

                          return (
                            <path
                              key={`${eq.inputName}-${factor}-${factorIndex}`}
                              d={`M ${source.x} ${source.y}
                                  H ${routeX}
                                  V ${targetY}
                                  H ${gateX}`}
                              className="logic-input-wire"
                              fill="none"
                            />
                          );
                        })}

                        {terms.length > 1 ? (
                          <line
                            x1={gateX + 76}
                            y1={gateY + 24}
                            x2={orX}
                            y2={rowY + 24}
                            className="svg-wire"
                            markerEnd="url(#arrow)"
                          />
                        ) : (
                          <line
                            x1={gateX + 76}
                            y1={gateY + 24}
                            x2={ffX}
                            y2={pinY}
                            className="svg-wire"
                            markerEnd="url(#arrow)"
                          />
                        )}
                      </g>
                    );
                  })}

                  {terms.length > 1 && (
                    <>
                      <OrGate x={orX} y={rowY} label={eq.expression} />
                      <line
                        x1={orX + 90}
                        y1={rowY + 24}
                        x2={ffX}
                        y2={pinY}
                        className="svg-wire"
                        markerEnd="url(#arrow)"
                      />
                    </>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Flip-flops and real feedback loops */}
        {stateVariables.map((q) => {
          const y = getFfY(q);
          const qNumber = q.replace("Q", "");
          const qOutY = getQOutputY(q);
          const qBarOutY = getQBarOutputY(q);

          const qLaneY = getFeedbackLaneY(q);
          const qBarLaneY = getFeedbackLaneY(`${q}'`);

          return (
            <g key={q}>
              <rect x={ffX} y={y} width={ffW} height={ffH} rx="8" className="svg-ff" />

              <text x={ffX + ffW / 2} y={y - 10} textAnchor="middle" className="svg-label">
                {q}
              </text>

              <text x={ffX + ffW / 2} y={y + 25} textAnchor="middle" className="svg-label">
                {design.ffType} Flip-Flop
              </text>

              {design.ffType === "D" ? (
                <text x={ffX + 14} y={y + 61} className="pin-label">
                  D{qNumber}
                </text>
              ) : (
                <>
                  <text x={ffX + 14} y={y + 53} className="pin-label">
                    J{qNumber}
                  </text>
                  <text x={ffX + 14} y={y + 105} className="pin-label">
                    K{qNumber}
                  </text>
                </>
              )}

              <text x={ffX + 68} y={y + ffH - 12} className="pin-label">
                CLK
              </text>

              <text x={ffX + ffW - 30} y={qOutY + 5} className="pin-label">
                Q
              </text>

              <text x={ffX + ffW - 36} y={qBarOutY + 5} className="pin-label">
                Q'
              </text>

              {/* visible Q output */}
              <line
                x1={ffX + ffW}
                y1={qOutY}
                x2={1120}
                y2={qOutY}
                className="svg-wire"
                markerEnd="url(#arrow)"
              />

              <text x="1132" y={qOutY + 5} className="signal-label">
                {q}
              </text>

              {/* Q feedback: output -> right side -> upper return lane */}
              <path
                d={`M ${ffX + ffW + 35} ${qOutY}
                    H ${feedbackRightX}
                    V ${qLaneY}
                    H ${feedbackRightX}`}
                className="feedback-return-wire"
                fill="none"
              />

              {/* Q' feedback */}
              <path
                d={`M ${ffX + ffW} ${qBarOutY}
                    H ${feedbackRightX + 18}
                    V ${qBarLaneY}
                    H ${feedbackRightX}`}
                className="feedback-return-wire"
                fill="none"
              />
            </g>
          );
        })}

        {/* Output logic */}
        <rect
          x={ffX}
          y={outputBlockY}
          width="185"
          height="76"
          rx="10"
          className="svg-output"
        />

        <text x={ffX + 92} y={outputBlockY + 32} textAnchor="middle" className="svg-label">
          Output Logic
        </text>

        <text x={ffX + 92} y={outputBlockY + 58} textAnchor="middle" className="svg-small">
          Output: {outputText}
        </text>

        <path
          d={`M ${inputX2} ${inputY0}
              H ${ffX - 95}
              V ${outputBlockY + 38}
              H ${ffX}`}
          className="logic-input-wire"
          fill="none"
          markerEnd="url(#arrow)"
        />

        <line
          x1={ffX + 185}
          y1={outputBlockY + 38}
          x2="1120"
          y2={outputBlockY + 38}
          className="svg-wire"
          markerEnd="url(#arrow)"
        />

        <text x="1132" y={outputBlockY + 43} className="signal-label">
          {outputText}
        </text>

        {/* Clock */}
        <line x1="55" y1={clockY} x2="1070" y2={clockY} className="clock-wire" />
        <text x="55" y={clockY - 14} className="signal-label">
          CLK
        </text>

        {stateVariables.map((q) => {
          const y = getFfY(q);

          return (
            <line
              key={`clk-${q}`}
              x1={ffX + 72}
              y1={clockY}
              x2={ffX + 72}
              y2={y + ffH}
              className="clock-wire"
              markerEnd="url(#arrow)"
            />
          );
        })}

        <text x="40" y={height - 20} className="svg-note">
          Circuit diagram is generated from simplified flip-flop input equations.
        </text>
      </svg>
    </div>
  );
}

function downloadSvg(svgId: string, filename: string) {
  const svgElement = document.getElementById(svgId);

  if (!svgElement) {
    alert("找不到可以下載的圖表。");
    return;
  }

  const serializer = new XMLSerializer();
  const svgText = serializer.serializeToString(svgElement);

  const blob = new Blob([svgText], {
    type: "image/svg+xml;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}


function StateTransitionChart({
  design,
}: {
  design: ReturnType<typeof generateDesign>;
}) {
  const width = 760;
  const height = 420;
  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const radius = 135;

  const states = design.stateNames;

  const positions: Record<string, { x: number; y: number }> = {};

  states.forEach((state, index) => {
    const angle = (2 * Math.PI * index) / states.length - Math.PI / 2;
    positions[state] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  function getSelfLoopPath(x: number, y: number) {
    return `M ${x + 25} ${y - 35}
            C ${x + 95} ${y - 95}, ${x - 95} ${y - 95}, ${x - 25} ${y - 35}`;
  }

  function getTransitionPath(from: string, to: string, index: number) {
    const start = positions[from];
    const end = positions[to];

    if (!start || !end) return "";

    if (from === to) {
      return getSelfLoopPath(start.x, start.y);
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    const nodeRadius = 32;

    const startX = start.x + (dx / length) * nodeRadius;
    const startY = start.y + (dy / length) * nodeRadius;
    const endX = end.x - (dx / length) * nodeRadius;
    const endY = end.y - (dy / length) * nodeRadius;

    const curveOffset = index % 2 === 0 ? 28 : -28;
    const midX = (startX + endX) / 2 - (dy / length) * curveOffset;
    const midY = (startY + endY) / 2 + (dx / length) * curveOffset;

    return `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
  }

  function getLabelPosition(from: string, to: string, index: number) {
    const start = positions[from];
    const end = positions[to];

    if (!start || !end) {
      return { x: 0, y: 0 };
    }

    if (from === to) {
      return {
        x: start.x,
        y: start.y - 95,
      };
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    const curveOffset = index % 2 === 0 ? 28 : -28;

    return {
      x: (start.x + end.x) / 2 - (dy / length) * curveOffset,
      y: (start.y + end.y) / 2 + (dx / length) * curveOffset,
    };
  }

  return (
    <div className="transition-section">
      <div className="transition-header">
        <h3>State Transition Chart</h3>

        <button
          onClick={() =>
            downloadSvg("state-transition-chart", "state-transition-chart.svg")
          }
        >
          Download Chart SVG
        </button>
      </div>

      <div className="transition-wrapper">
        <svg
          id="state-transition-chart"
          className="transition-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="State transition chart"
        >
          <defs>
            <marker
              id="transitionArrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#333" />
            </marker>
          </defs>

          <text x="24" y="34" className="svg-title">
            State Transition Chart
          </text>

          <text x="24" y="58" className="svg-note">
            Edge label format: input / output
          </text>

          {design.transitions.map((transition, index) => {
            const labelPosition = getLabelPosition(
              transition.present,
              transition.next,
              index
            );

            return (
              <g key={`${transition.present}-${transition.next}-${index}`}>
                <path
                  d={getTransitionPath(
                    transition.present,
                    transition.next,
                    index
                  )}
                  className="transition-edge"
                  fill="none"
                  markerEnd="url(#transitionArrow)"
                />

                <rect
                  x={labelPosition.x - 34}
                  y={labelPosition.y - 13}
                  width="68"
                  height="24"
                  rx="6"
                  className="transition-label-bg"
                />

                <text
                  x={labelPosition.x}
                  y={labelPosition.y + 4}
                  textAnchor="middle"
                  className="transition-label"
                >
                  {transition.input} / {transition.output || "-"}
                </text>
              </g>
            );
          })}

          {states.map((state) => {
            const position = positions[state];

            return (
              <g key={state}>
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="34"
                  className="state-node"
                />

                <text
                  x={position.x}
                  y={position.y - 4}
                  textAnchor="middle"
                  className="state-node-text"
                >
                  {state}
                </text>

                <text
                  x={position.x}
                  y={position.y + 16}
                  textAnchor="middle"
                  className="state-code-text"
                >
                  {design.stateCodes[state]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}



export default function App() {

  const [modelType, setModelType] = useState<ModelType>("Mealy");
  const [ffType, setFfType] = useState<FFType>("JK");

  const [inputVariables, setInputVariables] = useState("X");
  const [outputVariables, setOutputVariables] = useState("Z");
  const [rows, setRows] = useState<StateRow[]>(exampleRows);

  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<ReturnType<
    typeof generateDesign
  > | null>(null);

  const stateVariableText = useMemo(() => {
    if (!generated) return "-";
    return generated.stateVariables.join(" ");
  }, [generated]);

  function updateRow(index: number, key: keyof StateRow, value: string) {
    const copied = [...rows];
    copied[index] = {
      ...copied[index],
      [key]: value,
    };
    setRows(copied);
  }

  function addRow() {
    setRows([...rows, { present: "", input: "", next: "", output: "" }]);
  }

  function deleteRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function loadExample() {
    setModelType("Mealy");
    setFfType("JK");
    setInputVariables("X");
    setOutputVariables("Z");
    setRows(exampleRows);
    setGenerated(null);
    setError("");
  }

  function handleGenerate() {
    try {
      const result = generateDesign(rows, inputVariables, ffType);
      setGenerated(result);
      setError("");
    } catch (err) {
      setGenerated(null);
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    }
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div>
          <h1>Sequential Circuit Design Automation System</h1>
          <p className="student-info">
            姓名：<span>邵亭毓</span>
            學號：<span>1140939</span>
          </p>
        </div>
      </header>

      <main className="layout">
        <section className="panel input-panel">
          <div className="block">
            <h2>1. Model Type</h2>
            <label>
              <input
                type="radio"
                checked={modelType === "Mealy"}
                onChange={() => setModelType("Mealy")}
              />
              Mealy Model
            </label>

            <label>
              <input
                type="radio"
                checked={modelType === "Moore"}
                onChange={() => setModelType("Moore")}
              />
              Moore Model
            </label>
          </div>

          <div className="block">
            <h2>2. Flip-Flop Type</h2>
            <label>
              <input
                type="radio"
                checked={ffType === "JK"}
                onChange={() => setFfType("JK")}
              />
              JK Flip-Flop
            </label>

            <label>
              <input
                type="radio"
                checked={ffType === "D"}
                onChange={() => setFfType("D")}
              />
              D Flip-Flop
            </label>
          </div>

          <div className="block">
            <h2>3. State Table Input</h2>

            <label className="text-label">
              Input Variables
              <input
                value={inputVariables}
                onChange={(e) => setInputVariables(e.target.value)}
                placeholder="例如 X 或 X,Y"
              />
            </label>

            <label className="text-label">
              Output Variables
              <input
                value={outputVariables}
                onChange={(e) => setOutputVariables(e.target.value)}
                placeholder="例如 Z"
              />
            </label>

            <table className="state-table">
              <thead>
                <tr>
                  <th>Present State</th>
                  <th>Input</th>
                  <th>Next State</th>
                  <th>Output</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        value={row.present}
                        onChange={(e) =>
                          updateRow(index, "present", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.input}
                        onChange={(e) =>
                          updateRow(index, "input", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.next}
                        onChange={(e) =>
                          updateRow(index, "next", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.output}
                        onChange={(e) =>
                          updateRow(index, "output", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <button className="small-button" onClick={() => deleteRow(index)}>
                        刪
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="button-row">
              <button onClick={addRow}>Add Row</button>
              <button onClick={loadExample}>Load Example</button>
            </div>
          </div>
        </section>

        <section className="panel output-panel">
          <h2>Output 1: Flip-Flop Input Equations</h2>

          {!generated && (
            <p className="hint">
              請按下 Generate，生成Output1。
            </p>
          )}

          {error && <div className="error">{error}</div>}

          {generated && (
            <>
              <h3>State Encoding</h3>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Code</th>
                  </tr>
                </thead>

                <tbody>
                  {generated.stateNames.map((state) => (
                    <tr key={state}>
                      <td>{state}</td>
                      <td>{generated.stateCodes[state]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <KMapPreview equations={generated.equations} />

              <StateTransitionChart design={generated} />

              <h3>State Variables: {stateVariableText}</h3>

              <h3>Flip-Flop Input Equations Simplified</h3>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Flip-Flop</th>
                    <th>Input</th>
                    <th>Equation</th>
                  </tr>
                </thead>

                <tbody>
                  {generated.equations.map((eq, index) => (
                    <tr key={index}>
                      <td>{eq.flipflop}</td>
                      <td>{eq.inputName}</td>
                      <td className="equation">
                        {eq.inputName} = {eq.expression}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="panel diagram-panel">
          <h2>Output 2: Sequential Circuit Diagram</h2>

          {!generated && (
            <div className="placeholder">
              <p>請按下 Generate。</p>
              <p>系統會根據 Output1 自動產生 sequential circuit diagram。</p>
            </div>
          )}

          {generated && (
            <CircuitDiagram
              design={generated}
              outputVariables={outputVariables}
            />
          )}
        </section>
      </main>

      <footer className="footer">
        <button className="generate-button" onClick={handleGenerate}>
          Generate
        </button>
        <button onClick={loadExample}>Load Example</button>
        <button disabled>Export Report</button>
        <button disabled>About</button>
      </footer>
    </div>
  );
}