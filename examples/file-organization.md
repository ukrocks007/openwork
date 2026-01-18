# Example: File Organization

This example demonstrates how to use Cowork Lite to organize a messy folder of receipts.

## Setup

```bash
# Create example data
mkdir -p examples/receipts
echo "Receipt from Starbucks - $5.50" > examples/receipts/starbucks.txt
echo "Amazon order #123 - $23.99" > examples/receipts/amazon.txt
echo "Grocery store - $87.43" > examples/receipts/groceries.txt
```

## Run

```bash
# Preview the plan
npm run dev "organize this folder of receipts into categories and output an expenses CSV" ./examples/receipts --dry-run

# Execute the plan
npm run dev "organize this folder of receipts into categories and output an expenses CSV" ./examples/receipts
```

## Expected Output

The system will:
1. Scan the receipts folder
2. Analyze file contents
3. Create organized folder structure (documents, etc.)
4. Extract expense data
5. Generate an expenses CSV file