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
      });

      equations.push({
        flipflop: `FF for Q${label}`,
        inputName: `K${label}`,
        expression: simplifySOP(kMinterms, kDontCares, allVariables),
      });
    }
  }

  return {
    stateNames,
    stateCodes,
    stateVariables,
    equations,
  };
}

export default function App() {
  const [studentName, setStudentName] = useState("請填姓名");
  const [studentId, setStudentId] = useState("請填學號");

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
          <p>
            姓名：
            <input
              className="student-input"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
            />
            學號：
            <input
              className="student-input"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
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
              請先按下 Generate。今天的目標是先完成 Output1。
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
          <div className="placeholder">
            <p>明天完成這一區。</p>
            <p>今日先確認 Output1 正常產生。</p>
          </div>
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