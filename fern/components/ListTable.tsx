import React, { ReactNode, ReactElement, isValidElement, useState, useEffect } from 'react';

// Global platform detection - runs once at module load time
// This allows SSR to work correctly by detecting platform before any component renders
const detectPlatformAtBuildTime = (): 'fern' | 'docusaurus' | null => {
  try {
    // Check if we're in a build environment with process.env
    const globalProcess = (globalThis as any).process;
    const envPlatform = globalProcess?.env?.DOCS_PLATFORM ||
                       globalProcess?.env?.NEXT_PUBLIC_DOCS_PLATFORM ||
                       globalProcess?.env?.DOCUSAURUS_PLATFORM;

    if (envPlatform === 'fern' || envPlatform === 'docusaurus') {
      return envPlatform as 'fern' | 'docusaurus';
    }
  } catch {
    // process.env not available
  }
  return null;
};

// Detect platform once at module load (works for SSR)
const GLOBAL_PLATFORM = detectPlatformAtBuildTime();

// --- Types ---
interface ListTableProps {
  children?: ReactNode;
  data?: string[][]; // Alternative: pass data as array of arrays
  headerRows?: number;
  headerColumns?: number;
  footerRows?: number;
  className?: string;
  caption?: ReactNode;
  validation?: 'strict' | 'warn' | 'off';
  id?: string; // Optional identifier for debugging purposes
  platform?: 'fern' | 'docusaurus' | 'auto'; // Explicitly specify platform for SSR (defaults to 'fern')
}

interface CellData {
  content: ReactNode;
  rowSpan: number;
  colSpan: number;
  isPlaceholder: boolean;
}

interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  row?: number;
  col?: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Props interfaces for type-safe child traversal
// (works with both @types/react@18 and @19)
interface ChildProps {
  children?: ReactNode;
}

interface MdxElementProps extends ChildProps {
  mdxType?: string;
  originalType?: string;
}

// --- Helpers ---

// recursive helper to find the text content for Regex parsing
const getTextContent = (node: ReactNode): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (isValidElement(node) && (node.props as ChildProps).children) {
    return getTextContent((node.props as ChildProps).children);
  }
  return '';
};

// Inspects a cell's content to extract [props] and check for placeholders
const processCell = (children: ReactNode): CellData => {
  let rowSpan = 1;
  let colSpan = 1;
  let isPlaceholder = false;

  // We only look at the immediate text of the first child to find markers
  const childrenArray = React.Children.toArray(children);
  const firstChild = childrenArray[0];
  
  // Extract text for analysis (shallow check is usually enough for markers)
  const textCheck = typeof firstChild === 'string' ? firstChild : getTextContent(firstChild);

  // Regex for Span Markers: [r2c3] - also captures invalid values like [r0] or [c-1] for validation
  const spanMatch = textCheck.match(/^\[\s*(?:r(-?\d+))?\s*(?:c(-?\d+))?\s*\]/);

  // Placeholder Marker: _
  const placeholderMatch = textCheck.trim() === '_';

  if (placeholderMatch) {
    isPlaceholder = true;
    // We clean the content so it's empty, though it won't be rendered anyway
    childrenArray[0] = '';
  } else if (spanMatch) {
    if (spanMatch[1]) rowSpan = parseInt(spanMatch[1], 10);
    if (spanMatch[2]) colSpan = parseInt(spanMatch[2], 10);

    // Remove the marker text from the first child
    if (typeof firstChild === 'string') {
        childrenArray[0] = firstChild.replace(spanMatch[0], '').trim();
    }
  }

  return {
    rowSpan,
    colSpan,
    isPlaceholder,
    content: childrenArray,
  };
};

// Validates table structure and returns errors/warnings
const validateTable = (
  rawRows: CellData[][],
  mode: 'strict' | 'warn' | 'off' = 'warn'
): ValidationResult => {
  if (mode === 'off') {
    return { isValid: true, errors: [] };
  }

  const errors: ValidationError[] = [];
  const totalRows = rawRows.length;

  // Track occupied cells across all rows (simulating the rendering logic)
  const occupied = new Set<string>();

  // Calculate expected column count from the first row (source cell count)
  // This is the number of cells the user actually typed in row 0, which defines the table structure
  const expectedCols = rawRows.length > 0 ? rawRows[0].length : 0;

  // Validate each row
  rawRows.forEach((row, rowIndex) => {
    // 1. Check if row has same number of cells as first row (width consistency)
    if (row.length !== expectedCols) {
      errors.push({
        type: 'error',
        message: `Row has inconsistent width. Expected ${expectedCols} cells, found ${row.length}.`,
        row: rowIndex,
      });
    }

    // 2. Validate each cell and check for span-related issues
    row.forEach((cell, cellIndex) => {
      // Validate span values
      if (cell.rowSpan <= 0 || !Number.isInteger(cell.rowSpan)) {
        errors.push({
          type: 'error',
          message: `Invalid rowSpan value: ${cell.rowSpan}. Must be a positive integer.`,
          row: rowIndex,
          col: cellIndex,
        });
      }

      if (cell.colSpan <= 0 || !Number.isInteger(cell.colSpan)) {
        errors.push({
          type: 'error',
          message: `Invalid colSpan value: ${cell.colSpan}. Must be a positive integer.`,
          row: rowIndex,
          col: cellIndex,
        });
      }

      // Skip placeholder cells for span validation (they will be validated separately)
      if (cell.isPlaceholder) {
        return;
      }

      const effectiveRowSpan = Math.max(1, cell.rowSpan);
      const effectiveColSpan = Math.max(1, cell.colSpan);

      // Check for rowspan overflow
      if (effectiveRowSpan > 1 && rowIndex + effectiveRowSpan > totalRows) {
        errors.push({
          type: 'error',
          message: `Cell rowSpan (${cell.rowSpan}) extends beyond table bounds. Table has ${totalRows} rows (1-${totalRows}), but span reaches row ${rowIndex + effectiveRowSpan}.`,
          row: rowIndex,
          col: cellIndex,
        });
      }

      // Check for colspan overflow (does it exceed remaining cells in this row?)
      if (effectiveColSpan > 1) {
        const remainingCells = row.length - cellIndex;
        if (effectiveColSpan > remainingCells) {
          errors.push({
            type: 'error',
            message: `Cell colSpan (${cell.colSpan}) extends beyond row bounds. Row has ${remainingCells} remaining cells (including this one), but colSpan requires ${effectiveColSpan}.`,
            row: rowIndex,
            col: cellIndex,
          });
        } else {
          // Check if there are enough placeholders following this cell for the colspan
          let placeholderCount = 0;
          for (let i = 1; i < effectiveColSpan; i++) {
            if (cellIndex + i < row.length && row[cellIndex + i].isPlaceholder) {
              placeholderCount++;
            }
          }
          if (placeholderCount < effectiveColSpan - 1) {
            errors.push({
              type: 'error',
              message: `Cell colSpan (${cell.colSpan}) doesn't have enough placeholders. Expected ${effectiveColSpan - 1} placeholders after this cell, found ${placeholderCount}.`,
              row: rowIndex,
              col: cellIndex,
            });
          }
        }
      }

      // Check if there are enough placeholders in following rows for the rowspan
      if (effectiveRowSpan > 1) {
        let placeholderCount = 0;
        for (let r = 1; r < effectiveRowSpan; r++) {
          const targetRow = rowIndex + r;
          if (targetRow < rawRows.length && cellIndex < rawRows[targetRow].length) {
            if (rawRows[targetRow][cellIndex].isPlaceholder) {
              placeholderCount++;
            }
          }
        }
        if (placeholderCount < effectiveRowSpan - 1) {
          errors.push({
            type: 'error',
            message: `Cell rowSpan (${cell.rowSpan}) doesn't have enough placeholders. Expected ${effectiveRowSpan - 1} placeholders in following rows at column ${cellIndex + 1}, found ${placeholderCount}.`,
            row: rowIndex,
            col: cellIndex,
          });
        }
      }

      // Mark cells as occupied for orphan placeholder detection
      if (effectiveRowSpan > 1 || effectiveColSpan > 1) {
        for (let r = 0; r < effectiveRowSpan; r++) {
          for (let c = 0; c < effectiveColSpan; c++) {
            if (r === 0 && c === 0) continue; // Don't mark self
            occupied.add(`${rowIndex + r},${cellIndex + c}`);
          }
        }
      }
    });
  });

  // 3. Check for orphaned placeholders (placeholders not associated with any span)
  rawRows.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      if (cell.isPlaceholder && !occupied.has(`${rowIndex},${cellIndex}`)) {
        errors.push({
          type: 'error',
          message: `Placeholder found that doesn't belong to a rowSpan or colSpan.`,
          row: rowIndex,
          col: cellIndex,
        });
      }
    });
  });

  return {
    isValid: errors.filter(e => e.type === 'error').length === 0,
    errors,
  };
};

// Error display component
const TableErrorDisplay = ({ errors }: { errors: ValidationError[] }) => (
  <div className="p-4 border-2 border-red-500 bg-red-50 rounded">
    <h4 className="font-bold text-red-700 mb-2">Table Validation Errors:</h4>
    <ul className="list-disc list-inside space-y-1">
      {errors.map((err, i) => (
        <li key={i} className={err.type === 'error' ? 'text-red-600' : 'text-orange-600'}>
          {err.row !== undefined ? `Row ${err.row + 1}${err.col !== undefined ? `, Col ${err.col + 1}` : ''}: ` : ''}
          {err.message}
        </li>
      ))}
    </ul>
  </div>
);

export const ListTable = ({
  children,
  headerRows = 0,
  headerColumns = 0,
  footerRows = 0,
  className = "",
  caption,
  validation = 'warn',
  id,
  platform = 'fern' // Default to Fern since that's the primary use case
}: ListTableProps) => {

  // Determine if we should use Fern-specific rendering
  // Priority: explicit prop > global platform detection > auto-detection
  const determinePlatform = (): 'fern' | 'docusaurus' | 'auto' => {
    if (platform !== 'auto') return platform;
    if (GLOBAL_PLATFORM) return GLOBAL_PLATFORM;
    return 'auto';
  };

  const effectivePlatform = determinePlatform();

  // For SSR: if we know the platform from env/prop, use it immediately without state
  // This prevents hydration mismatches and layout shifts
  const isFernFromPlatform = effectivePlatform === 'fern';
  const needsAutoDetection = effectivePlatform === 'auto';

  // Only use state for auto-detection fallback
  const [isFernDetected, setIsFernDetected] = useState(false);

  useEffect(() => {
    // Only run auto-detection if we don't already know the platform
    if (needsAutoDetection) {
      // Check for Fern-specific elements that are always present in Fern docs
      const hasFernLayout = document.querySelector('.fern-layout') !== null ||
                            document.querySelector('.fern-layout-guide') !== null ||
                            document.querySelector('.fern-header') !== null ||
                            document.querySelector('[class*="fern-"]') !== null;

      setIsFernDetected(hasFernLayout);
    }
  }, [needsAutoDetection]);

  // Use platform-determined value if available, otherwise use detected value
  const isFern = needsAutoDetection ? isFernDetected : isFernFromPlatform;

  // 1. Flatten the MDX structure into a 2D Array
  const rawRows: CellData[][] = [];

  // Handle Fern's MDX which wraps lists in a function component
  let outerList = React.Children.only(children) as ReactElement<MdxElementProps>;
  let outerProps = outerList.props as MdxElementProps;

  // If the child is a function component (Fern's wrapper), we need to work with its children directly
  if (typeof outerList?.type === 'function') {
    // Fern wraps the markdown list in a styled component
    // The actual list items are in props.children
    // We'll process them directly without needing the ul wrapper
    const wrappedChildren = outerProps?.children;

    if (Array.isArray(wrappedChildren)) {
      // Process the list items directly from Fern's wrapper
      wrappedChildren.forEach((rowLi) => {
        if (!isValidElement(rowLi)) return;

        const rowElement = rowLi as ReactElement<ChildProps>;
        const rowChildren = React.Children.toArray((rowElement.props as ChildProps).children);

        // Find the nested list (cells)
        const cellList = rowChildren.find(
          (child) => isValidElement(child) && (
            child.type === 'ul' ||
            typeof child.type === 'function' ||
            (child.props as MdxElementProps)?.mdxType === 'ul'
          )
        ) as ReactElement<ChildProps>;

        if (cellList) {
          const rowCells: CellData[] = [];
          const cellChildren = (cellList.props as ChildProps).children;

          React.Children.forEach(cellChildren, (cellLi) => {
            if (!isValidElement(cellLi)) return;
            const cellElement = cellLi as ReactElement<ChildProps>;
            rowCells.push(processCell((cellElement.props as ChildProps).children));
          });

          if (rowCells.length > 0) {
            rawRows.push(rowCells);
          }
        }
      });

      // Skip the normal ul processing since we already processed the rows
      if (rawRows.length === 0) {
        return <div className="p-4 border border-red-500">
          Error: Could not parse table structure from Fern MDX.
        </div>;
      }
    } else {
      return <div className="p-4 border border-red-500">
        Error: Expected array of list items from Fern MDX wrapper.
      </div>;
    }
  } else {
    // Standard MDX processing (non-Fern)
    const isUl = outerList?.type === 'ul' ||
                 outerProps?.mdxType === 'ul' ||
                 outerProps?.originalType === 'ul';

    if (!outerList || !isUl) {
       const actualType = typeof outerList?.type === 'string' ? outerList?.type : typeof outerList?.type;
       const mdxType = outerProps?.mdxType;

       return <div className="p-4 border border-red-500">
         Error: ListTable content must be a Markdown list.
         <br />
         <small>Received type: {actualType}, mdxType: {mdxType}</small>
       </div>;
    }

    // Process standard ul structure
    React.Children.forEach(outerProps.children, (rowLi) => {
      if (!isValidElement(rowLi)) return;

      const rowElement = rowLi as ReactElement<ChildProps>;
      const rowChildren = React.Children.toArray((rowElement.props as ChildProps).children);
      const cellList = rowChildren.find(
        (child) => isValidElement(child) && (child.type === 'ul' || (child.props as MdxElementProps)?.mdxType === 'ul')
      ) as ReactElement<ChildProps>;

      if (cellList) {
        const rowCells: CellData[] = [];
        React.Children.forEach((cellList.props as ChildProps).children, (cellLi) => {
          if (!isValidElement(cellLi)) return;
          const cellElement = cellLi as ReactElement<ChildProps>;
          rowCells.push(processCell((cellElement.props as ChildProps).children));
        });
        rawRows.push(rowCells);
      }
    });
  }

  // 2. Validate table structure
  const validationResult = validateTable(rawRows, validation);

  // Handle validation errors
  if (!validationResult.isValid && validation === 'strict') {
    return <TableErrorDisplay errors={validationResult.errors} />;
  }

  if (validationResult.errors.length > 0 && validation === 'warn') {
    // Build table identifier for error messages
    const tableIdentifier = id
      ? `id="${id}"`
      : caption
        ? `caption="${typeof caption === 'string' ? caption : '[complex caption]'}"`
        : 'table';

    validationResult.errors.forEach(err => {
      const location = err.row !== undefined ? ` Row ${err.row + 1}` : '';
      console.warn(`[ListTable ${tableIdentifier}] ${err.type}: ${err.message}${location}`);
    });
  }

  // 3. Check section boundaries
  const theadRowCount = headerRows;
  const tfootRowCount = footerRows;

  if (theadRowCount + tfootRowCount > rawRows.length) {
    return (
      <div className="p-4 border border-red-500">
        Error: headerRows ({theadRowCount}) + footerRows ({tfootRowCount}) exceeds total rows ({rawRows.length})
      </div>
    );
  }

  // 4. Render section function with grid tracking
  const occupied = new Set<string>(); // Tracks "r,c" coordinates that are covered across ALL sections

  const renderSection = (
    rows: CellData[][],
    startIdx: number,
    isHeaderSection: boolean,
    useFernStyles: boolean = isFern
  ): ReactNode[] => {
    const renderedRows: ReactNode[] = [];

    rows.forEach((row, relativeRowIndex) => {
      const absoluteRowIndex = startIdx + relativeRowIndex;
      const renderedCells: ReactNode[] = [];
      let logicalColIndex = 0;
      let userCellPtr = 0;

      while (userCellPtr < row.length) {
        const currentKey = `${absoluteRowIndex},${logicalColIndex}`;

        // Check if this spot is already occupied by a rowspan from above
        if (occupied.has(currentKey)) {
          const candidate = row[userCellPtr];
          if (candidate.isPlaceholder) {
            userCellPtr++; // Consume the placeholder
          }

          logicalColIndex++;
          continue;
        }

        // Take the next real cell
        const cell = row[userCellPtr];
        userCellPtr++;

        // If this cell is a placeholder but not in an occupied spot, skip it
        // This handles colspan placeholders in the same row
        if (cell.isPlaceholder) {
          logicalColIndex++;
          continue;
        }

        // For grid calculations, treat invalid span values as 1
        const effectiveRowSpan = Math.max(1, cell.rowSpan);
        const effectiveColSpan = Math.max(1, cell.colSpan);

        // Calculate if this cell should be a header
        const isHeaderRow = isHeaderSection;
        const isHeaderCol = logicalColIndex < headerColumns;
        const Component = (isHeaderRow || isHeaderCol) ? 'th' : 'td';

        let scope: string | undefined;
        if (isHeaderRow) scope = "col";
        if (isHeaderCol) scope = "row";

        // Mark future spots as occupied based on this cell's spans
        if (effectiveRowSpan > 1 || effectiveColSpan > 1) {
          for (let r = 0; r < effectiveRowSpan; r++) {
            for (let c = 0; c < effectiveColSpan; c++) {
              if (r === 0 && c === 0) continue; // Don't mark self
              occupied.add(`${absoluteRowIndex + r},${logicalColIndex + c}`);
            }
          }
        }

        renderedCells.push(
          <Component
            key={`${absoluteRowIndex}-${logicalColIndex}`}
            rowSpan={effectiveRowSpan > 1 ? effectiveRowSpan : undefined}
            colSpan={effectiveColSpan > 1 ? effectiveColSpan : undefined}
            scope={scope}
            className={useFernStyles ? undefined : "border border-gray-300 p-2 text-left align-top"}
          >
            {cell.content}
          </Component>
        );

        logicalColIndex += effectiveColSpan;

        // Consume placeholder cells that follow a colspan in the same row
        if (effectiveColSpan > 1) {
          for (let i = 1; i < effectiveColSpan; i++) {
            if (userCellPtr < row.length && row[userCellPtr].isPlaceholder) {
              userCellPtr++;
            }
          }
        }
      }

      renderedRows.push(<tr key={absoluteRowIndex}>{renderedCells}</tr>);
    });

    return renderedRows;
  };

  // 5. Render each section
  const theadContent = theadRowCount > 0
    ? renderSection(rawRows.slice(0, theadRowCount), 0, true)
    : null;

  const tbodyContent = renderSection(
    rawRows.slice(theadRowCount, rawRows.length - tfootRowCount),
    theadRowCount,
    false
  );

  const tfootContent = tfootRowCount > 0
    ? renderSection(rawRows.slice(-tfootRowCount), rawRows.length - tfootRowCount, false)
    : null;

  if (isFern) {
    // Fern-specific rendering with custom caption styling
    return (
      <>
        {caption && (
          <div className="list-table-caption">
            {caption}
          </div>
        )}
        <div className="fern-table-root not-prose" data-state="closed">
          <div dir="ltr" className="fern-scroll-area" style={{position: 'relative'}}>
            <div className="fern-scroll-area-viewport" data-scrollbars="both" style={{overflow: 'scroll'}}>
              <div style={{minWidth: '100%', display: 'table'}}>
                <table className={`fern-table ${className}`}>
                  {theadContent && <thead>{theadContent}</thead>}
                  <tbody>{tbodyContent}</tbody>
                  {tfootContent && <tfoot>{tfootContent}</tfoot>}
                </table>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Generic/Docusaurus rendering (style-agnostic)
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full border-collapse ${className}`}>
        {caption && <caption className="text-sm font-semibold mb-2 text-left">{caption}</caption>}
        {theadContent && <thead>{theadContent}</thead>}
        <tbody>{tbodyContent}</tbody>
        {tfootContent && <tfoot>{tfootContent}</tfoot>}
      </table>
    </div>
  );
};