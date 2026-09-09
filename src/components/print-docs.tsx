import { formatKg } from "@/lib/utils";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getAccess } from "@/lib/server";
import { useQuery } from "@tanstack/react-query";

export type PrintProject = {
  code: string;
  name: string;
  client_name: string | null;
  po_number: string | null;
  cabinet_size?: string | null;
  city_state?: string | null;
  dispatch_time?: string | null;
  address?: string | null;
  client_phone?: string | null;
};

export type PrintBox = {
  id: number;
  box_number: string;
  unit: string;
  seq: number;
  total_seq: number;
  total_weight_kg: string | number;
};

export type PrintPart = {
  id: number;
  box_id: number | null;
  unit: string;
  part_name: string;
  material: string;
  length_mm: string | number;
  width_mm: string | number;
  thickness_mm?: string | number;
  qty: number;
};

export function useCompanyName() {
  const user = useCurrentUser();
  const access = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });
  return access.data?.company || user?.displayName || "COMPANY NAME";
}

function today() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function dash(v?: string | null) {
  const s = (v ?? "").trim();
  return s || "";
}

function txt(v?: string | number | null) {
  if (v == null) return "";
  return String(v).trim();
}

/** One A4 packing list. Job heading once, then each packed box as its own block. */
export function PackingListPrint({
  project,
  boxes,
  parts,
  company,
}: {
  project: PrintProject;
  boxes: PrintBox[];
  parts: PrintPart[];
  company: string;
}) {
  const date = today();
  const orderNo = project.po_number || project.code;
  const total = boxes.length;
  return (
    <div className="pl-doc bg-white text-black">
      <table className="sheet-table pl-head">
        <tbody>
          <tr>
            <td colSpan={6} className="sheet-title">
              PACKING LIST
            </td>
          </tr>
          <tr>
            <td className="lab">COMPANY</td>
            <td className="val" colSpan={2}>
              {company}
            </td>
            <td className="lab">DATE</td>
            <td className="val" colSpan={2}>
              {date}
            </td>
          </tr>
          <tr>
            <td className="lab">CLIENT</td>
            <td className="val" colSpan={2}>
              {dash(project.client_name)}
            </td>
            <td className="lab">PROJECT</td>
            <td className="val" colSpan={2}>
              {project.name}
            </td>
          </tr>
          <tr>
            <td className="lab">ORDER NO</td>
            <td className="val" colSpan={2}>
              {orderNo}
            </td>
            <td className="lab">CLIENT MOB</td>
            <td className="val" colSpan={2}>
              {dash(project.client_phone)}
            </td>
          </tr>
          <tr>
            <td className="lab">CITY / STATE</td>
            <td className="val" colSpan={2}>
              {dash(project.city_state)}
            </td>
            <td className="lab">DISPATCH TIME</td>
            <td className="val" colSpan={2}>
              {dash(project.dispatch_time)}
            </td>
          </tr>
          <tr>
            <td className="lab">ADDRESS</td>
            <td className="val" colSpan={3}>
              {dash(project.address)}
            </td>
            <td className="lab">TOTAL BOX</td>
            <td className="val">{total}</td>
          </tr>
        </tbody>
      </table>

      {boxes.map((box, bi) => {
        const items = parts.filter((p) => p.box_id === box.id);
        const qty = items.reduce((s, p) => s + p.qty, 0);
        const boxLabel = `${txt(box.unit)} ${box.seq}/${box.total_seq}`.trim();
        return (
          <section key={box.id} className="pl-box">
            <div className="pl-boxbar">
              <span className="pl-box-no">
                BOX {String(bi + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </span>
              <span className="pl-box-unit">{boxLabel}</span>
              <span>QTY {qty}</span>
              <span>{formatKg(Number(box.total_weight_kg))}</span>
            </div>
            <table className="sheet-table pl-parts">
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>S NO.</th>
                  <th>UNIT NAME</th>
                  <th>PART NAME</th>
                  <th>MATERIAL</th>
                  <th>Length</th>
                  <th>Width</th>
                  <th>THK</th>
                  <th>QTY</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((p, i) => (
                    <tr key={p.id}>
                      <td className="num">{i + 1}</td>
                      <td>{p.unit}</td>
                      <td>{p.part_name}</td>
                      <td>{p.material}</td>
                      <td className="num">{Math.round(Number(p.length_mm))}</td>
                      <td className="num">{Math.round(Number(p.width_mm))}</td>
                      <td className="num">{Math.round(Number(p.thickness_mm ?? 0))}</td>
                      <td className="num">{p.qty}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-4 text-center">
                      No parts in this box
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/** Dispatch list = Packing Summary sheet. */
export function DispatchSummaryPrint({
  project,
  boxes,
  parts,
  company,
}: {
  project: PrintProject;
  boxes: PrintBox[];
  parts: PrintPart[];
  company: string;
}) {
  return (
    <div className="print-summary bg-white text-black">
      <table className="sheet-table">
        <tbody>
          <tr>
            <td colSpan={6} className="sheet-sub">
              PACKING SUMMARY
            </td>
          </tr>
          <tr>
            <td className="lab">Company</td>
            <td colSpan={2}>{company}</td>
            <td className="lab">Date</td>
            <td colSpan={2}>{today()}</td>
          </tr>
          <tr>
            <td className="lab">Client</td>
            <td colSpan={2}>{dash(project.client_name)}</td>
            <td className="lab">Order No.</td>
            <td colSpan={2}>{project.po_number || project.code}</td>
          </tr>
          <tr>
            <td className="lab">Project</td>
            <td colSpan={2}>{project.name}</td>
            <td className="lab">TOTAL BOX</td>
            <td colSpan={2}>{boxes.length}</td>
          </tr>
        </tbody>
      </table>
      <table className="sheet-table">
        <thead>
          <tr>
            <th>SR NO.</th>
            <th>UNIT ID</th>
            <th>UNIT NAME</th>
            <th>TOTAL QNTY</th>
            <th>BOX NO</th>
            <th>WEIGHT</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((b, i) => {
            const qty = parts.filter((p) => p.box_id === b.id).reduce((s, p) => s + p.qty, 0);
            return (
              <tr key={b.id}>
                <td className="text-center font-mono">{i + 1}</td>
                <td className="font-mono">{b.unit}</td>
                <td>{b.unit}</td>
                <td className="text-center font-mono">{qty}</td>
                <td className="font-mono">{b.box_number}</td>
                <td className="text-center font-mono">{formatKg(Number(b.total_weight_kg))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
