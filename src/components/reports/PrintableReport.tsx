/**
 * The page the browser prints (and saves as PDF).
 *
 * It is deliberately not a screenshot of the screen: a financial report is read
 * on paper and filed, so it carries the company's details, the period, the basis
 * of every figure, the balance check and signature lines. Both the printed page
 * and the Excel workbook render the same document model.
 */
import { Fragment } from "react";

import { t } from "@/domain/i18n";
import type { DocCell, DocIdentity, DocSection, ReportDocument } from "@/domain/reportDocument";

/** Three facts to a line keeps the header block to a few readable rows. */
const IDENTITY_COLUMNS = 3;

function identityRows(identity: readonly DocIdentity[]): DocIdentity[][] {
  const rows: DocIdentity[][] = [];
  for (let index = 0; index < identity.length; index += IDENTITY_COLUMNS) {
    rows.push(identity.slice(index, index + IDENTITY_COLUMNS));
  }
  return rows;
}

function Cell({ cell }: { cell: DocCell }) {
  return (
    <td className={cell.value === undefined ? undefined : "tabular text-right"}>{cell.text}</td>
  );
}

function Section({ section }: { section: DocSection }) {
  const total = section.columns.reduce((sum, column) => sum + column.width, 0) || 1;
  return (
    <section className="print-section">
      <div className="print-section-head">
        <h2>{t(section.title)}</h2>
        <p>{section.basis}</p>
      </div>
      {section.rows.length === 0 && section.emptyText ? (
        <p className="print-empty">{t(section.emptyText)}</p>
      ) : (
        <table className="print-table">
          <colgroup>
            {section.columns.map((column, index) => (
              <col key={index} style={{ width: `${(column.width / total) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {section.columns.map((column, index) => (
                <th key={index} className={column.align === "right" ? "text-right" : "text-left"}>
                  {t(column.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={row.strong ? "print-strong" : undefined}>
                {row.cells.map((cell, cellIndex) => (
                  <Cell key={cellIndex} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {section.notes?.map((note) => (
        <p key={note} className="print-note">
          {note}
        </p>
      ))}
    </section>
  );
}

export function PrintableReport({ document: doc }: { document: ReportDocument }) {
  const contact = [doc.company.address, doc.company.phone, doc.company.email]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="print-report hidden print:block">
      <header className="print-head print-keep">
        <div>
          <h1>{doc.company.name}</h1>
          {doc.company.legalName && <p className="print-company-line">{doc.company.legalName}</p>}
          {contact && <p className="print-company-line">{contact}</p>}
          {doc.company.taxNumber && (
            <p className="print-company-line">Tax number: {doc.company.taxNumber}</p>
          )}
        </div>
        <div className="print-head-right">
          <p className="print-doc-title">{t(doc.title)}</p>
          <p className="print-doc-period">{doc.subtitle}</p>
          <p className="print-company-line">
            {t("Base currency")}:{" "}
            {doc.identity.find((entry) => entry.label === "Base currency")?.value}
          </p>
        </div>
      </header>

      <table className="print-identity print-keep">
        <tbody>
          {identityRows(doc.identity).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((entry) => (
                <Fragment key={entry.label}>
                  <th>{t(entry.label)}</th>
                  <td>{entry.value}</td>
                </Fragment>
              ))}
              {row.length < IDENTITY_COLUMNS &&
                Array.from({ length: IDENTITY_COLUMNS - row.length }, (_, index) => (
                  <Fragment key={`pad-${index}`}>
                    <th />
                    <td />
                  </Fragment>
                ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-figures print-keep">
        {doc.figures.map((figure) => (
          <div key={figure.label} className="print-figure">
            <p className="print-figure-label">{t(figure.label)}</p>
            <p className="print-figure-value tabular">{figure.value}</p>
            {figure.note && <p className="print-figure-note">{figure.note}</p>}
          </div>
        ))}
      </div>

      {doc.sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}

      <section className="print-section print-keep">
        <div className="print-section-head">
          <h2>{t("Reconciliation checks")}</h2>
          <p>{t("Arithmetic the report must satisfy before it is filed.")}</p>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th className="text-left">{t("Check")}</th>
              <th className="text-left">{t("Result")}</th>
              <th className="text-left">{t("Detail")}</th>
            </tr>
          </thead>
          <tbody>
            {doc.checks.map((check) => (
              <tr key={check.label}>
                <td>{t(check.label)}</td>
                <td className={check.ok ? "print-ok" : "print-bad"}>
                  {check.ok ? t("Passed") : t("Failed")}
                </td>
                <td>{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-section print-keep">
        <div className="print-section-head">
          <h2>{t("Basis of preparation")}</h2>
        </div>
        <ol className="print-notes">
          {doc.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ol>
      </section>

      <footer className="print-signatures print-keep">
        <div>
          <span className="print-signature-line" />
          <p>{t("Prepared by")}</p>
        </div>
        <div>
          <span className="print-signature-line" />
          <p>{t("Checked by")}</p>
        </div>
        <div>
          <span className="print-signature-line" />
          <p>{t("Approved by")}</p>
        </div>
      </footer>
    </article>
  );
}
