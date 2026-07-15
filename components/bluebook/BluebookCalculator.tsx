import styles from "./BluebookExamClient.module.css";

export function BluebookCalculator() {
  return (
    <div className={styles.desmosFrameWrap}>
      <iframe
        className={styles.desmosFrame}
        src="https://www.desmos.com/testing/collegeboard/graphing"
        title="Desmos Graphing Calculator, College Board version"
        allow="clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
