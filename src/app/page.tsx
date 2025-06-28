"use client";

import React, { useState, useEffect } from 'react'; // Added useEffect
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Upload,
	Download,
	Check,
	AlertTriangle,
	X,
	FileText,
	Building2,
	RefreshCw,
	ChevronLeft,
	ChevronRight
} from 'lucide-react';
import Papa, { ParseError, ParseResult } from 'papaparse';

// PapaParse will be loaded via a script tag, so no import needed here.
// Type definitions
interface Transaction {
	transaction_reference: string;
	amount: number;
	status: string;
	date: string;
	counterparty?: string;
	currency?: string;
	[key: string]: string | number | undefined;
}

interface ReconciliationResult {
	matched: Transaction[];
	internalOnly: Transaction[];
	providerOnly: Transaction[];
	mismatched: {
		internal: Transaction;
		provider: Transaction;
		differences: string[];
	}[];
}

interface UploadedFile {
	name: string;
	data: Transaction[];
	type: 'internal' | 'provider';
}

interface PaginationState {
	matched: number;
	mismatched: number;
	internalOnly: number;
	providerOnly: number;
}

declare global {
	interface Window {
		Papa: typeof Papa;
	}
}


const ReconciliationTool: React.FC = () => {
	const [internalFile, setInternalFile] = useState<UploadedFile | null>(null);
	const [providerFile, setProviderFile] = useState<UploadedFile | null>(null);
	const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPapaLoaded, setIsPapaLoaded] = useState(false); // New state to track PapaParse loading

	// Added state variables for pagination
	const [currentPage, setCurrentPage] = useState<PaginationState>({
		matched: 1,
		mismatched: 1,
		internalOnly: 1,
		providerOnly: 1
	});

	const itemsPerPage = 10;

	// Load PapaParse script dynamically
	useEffect(() => {
		const scriptId = 'papaparse-script';
		if (!document.getElementById(scriptId)) {
			const script = document.createElement('script');
			script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js';
			script.id = scriptId;
			script.onload = () => setIsPapaLoaded(true);
			script.onerror = () => setError('Failed to load PapaParse library. Please check your internet connection.');
			document.head.appendChild(script);
		} else if (window.Papa) {
			setIsPapaLoaded(true);
		}
	}, []);

	// Helper function for paginated data
	const getPaginatedData = <T,>(data: T[], page: number, itemsPerPage: number = 10) => {
		const startIndex = (page - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		return {
			data: data.slice(startIndex, endIndex),
			totalPages: Math.ceil(data.length / itemsPerPage),
			currentPage: page,
			totalItems: data.length,
			startIndex: startIndex + 1,
			endIndex: Math.min(endIndex, data.length)
		};
	};

	// PaginationControls component
	const PaginationControls: React.FC<{
		currentPage: number;
		totalPages: number;
		onPageChange: (page: number) => void;
		totalItems: number;
		startIndex: number;
		endIndex: number;
	}> = ({ currentPage, totalPages, onPageChange, totalItems, startIndex, endIndex }) => {
		if (totalPages <= 1) return null;

		return (
			<div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 rounded-b-lg">
				<div className="flex items-center text-sm text-gray-700">
					<span>
						Showing {startIndex} to {endIndex} of {totalItems} results
					</span>
				</div>
				<div className="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onPageChange(currentPage - 1)}
						disabled={currentPage === 1}
						className="flex items-center rounded-lg"
					>
						<ChevronLeft className="h-4 w-4 mr-1" />
						Previous
					</Button>

					<div className="flex items-center space-x-1">
						{Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
							let pageNum;
							if (totalPages <= 5) {
								pageNum = i + 1;
							} else if (currentPage <= 3) {
								pageNum = i + 1;
							} else if (currentPage >= totalPages - 2) {
								pageNum = totalPages - 4 + i;
							} else {
								pageNum = currentPage - 2 + i;
							}

							return (
								<Button
									key={pageNum}
									variant={currentPage === pageNum ? "default" : "outline"}
									size="sm"
									onClick={() => onPageChange(pageNum)}
									className="w-8 h-8 p-0 rounded-lg"
								>
									{pageNum}
								</Button>
							);
						})}
					</div>

					<Button
						variant="outline"
						size="sm"
						onClick={() => onPageChange(currentPage + 1)}
						disabled={currentPage === totalPages}
						className="flex items-center rounded-lg"
					>
						Next
						<ChevronRight className="h-4 w-4 ml-1" />
					</Button>
				</div>
			</div>
		);
	};

	// Function to reset pagination when new reconciliation is performed
	const resetPagination = () => {
		setCurrentPage({
			matched: 1,
			mismatched: 1,
			internalOnly: 1,
			providerOnly: 1
		});
	};

	const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, fileType: 'internal' | 'provider') => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (!isPapaLoaded) {
			setError('PapaParse library is not loaded yet. Please wait a moment and try again.');
			return;
		}

		if (!file.name.toLowerCase().endsWith('.csv')) {
			setError('Please upload CSV files only');
			return;
		}

		setError(null);
		window.Papa.parse(file, { // Use window.Papa
			header: true,
			skipEmptyLines: true,
			dynamicTyping: true,
			complete: (results: ParseResult<Transaction>) => {
				if (results.errors.length > 0) {
					const firstError: ParseError = results.errors[0];
					setError(`Error parsing ${fileType} file: ${firstError.message}`);
					return;
				}

				const data = results.data as Transaction[];

				// Validate required fields
				if (data.length === 0) {
					setError(`${fileType} file is empty`);
					return;
				}

				const hasRequiredFields = data.every(row =>
					row.transaction_reference &&
					row.amount !== undefined &&
					row.status &&
					row.date
				);

				if (!hasRequiredFields) {
					setError(`${fileType} file missing required fields: transaction_reference, amount, status, date`);
					return;
				}

				const uploadedFile: UploadedFile = {
					name: file.name,
					data: data,
					type: fileType
				};

				if (fileType === 'internal') {
					setInternalFile(uploadedFile);
				} else {
					setProviderFile(uploadedFile);
				}
			},
			error: (error: { message: string; }) => { // Error object type from PapaParse
				setError(`Error reading ${fileType} file: ${error.message}`);
			}
		});

		// Reset input
		event.target.value = '';
	};

	const performReconciliation = () => {
		resetPagination();

		if (!internalFile || !providerFile) {
			setError('Please upload both files before reconciling');
			return;
		}

		setIsProcessing(true);
		setError(null);

		// Simulate processing delay
		setTimeout(() => {
			const result: ReconciliationResult = {
				matched: [],
				internalOnly: [],
				providerOnly: [],
				mismatched: []
			};

			// Create maps for efficient lookup
			const internalMap = new Map<string, Transaction>();
			const providerMap = new Map<string, Transaction>();

			internalFile.data.forEach(txn => {
				internalMap.set(txn.transaction_reference.toString().trim(), txn);
			});

			providerFile.data.forEach(txn => {
				providerMap.set(txn.transaction_reference.toString().trim(), txn);
			});

			// Find matches and mismatches
			internalFile.data.forEach(internalTxn => {
				const ref = internalTxn.transaction_reference.toString().trim();
				const providerTxn = providerMap.get(ref);

				if (providerTxn) {
					// Check for differences
					const differences: string[] = [];

					if (Math.abs(Number(internalTxn.amount) - Number(providerTxn.amount)) > 0.01) {
						differences.push(`Amount: ${formatCurrency(internalTxn.amount)} vs ${formatCurrency(providerTxn.amount)}`);
					}

					if (internalTxn.status !== providerTxn.status) {
						differences.push(`Status: ${internalTxn.status} vs ${providerTxn.status}`);
					}

					if (internalTxn.date !== providerTxn.date) {
						differences.push(`Date: ${internalTxn.date} vs ${providerTxn.date}`);
					}


					if (differences.length > 0) {
						result.mismatched.push({
							internal: internalTxn,
							provider: providerTxn,
							differences
						});
					} else {
						result.matched.push(internalTxn);
					}
				} else {
					result.internalOnly.push(internalTxn);
				}
			});

			// Find provider-only transactions
			providerFile.data.forEach(providerTxn => {
				const ref = providerTxn.transaction_reference.toString().trim();
				if (!internalMap.has(ref)) {
					result.providerOnly.push(providerTxn);
				}
			});

			setReconciliationResult(result);
			setIsProcessing(false);
		}, 1500);
	};

	const exportToCsv = (data: Record<string, unknown>[], filename: string) => {
		if (!isPapaLoaded) {
			setError('PapaParse library is not loaded yet. Cannot export CSV.');
			return;
		}
		const csv = window.Papa.unparse(data); // Use window.Papa
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = filename;
		link.click();
	};

	const formatCurrency = (amount: number): string => {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES',
			minimumFractionDigits: 2
		}).format(amount);
	};

	return (
		<div className="min-h-screen bg-gray-50 font-sans">
			{/* Header */}
			<header className="bg-white shadow-sm border-b">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex justify-between items-center py-4">
						<div className="flex items-center space-x-3">
							<Building2 className="h-8 w-8 text-blue-600" />
							<h1 className="text-2xl font-bold text-gray-900">Transaction Reconciliation Tool</h1>
						</div>
						<div className="text-sm text-gray-500">
							B2B Platform
						</div>
					</div>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{error && (
					<Alert className="mb-6 border-red-200 bg-red-50 rounded-lg">
						<AlertTriangle className="h-4 w-4 text-red-600" />
						<AlertDescription className="text-red-800">
							{error}
						</AlertDescription>
					</Alert>
				)}

				{/* File Upload Section */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
					<Card className="rounded-lg shadow-sm">
						<CardHeader>
							<CardTitle className="flex items-center space-x-2">
								<FileText className="h-5 w-5 text-blue-600" />
								<span>Internal System Export</span>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
								<Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
								<p className="text-sm text-gray-600 mb-3">
									Upload your platform&apos;s transaction export
								</p>
								<input
									type="file"
									id="internal-upload"
									accept=".csv"
									onChange={(e) => handleFileUpload(e, 'internal')}
									className="hidden"
									disabled={!isPapaLoaded} // Disable if PapaParse not loaded
								/>
								<label
									htmlFor="internal-upload"
									className={`inline-flex items-center px-4 py-2 text-white rounded-lg cursor-pointer transition-colors ${isPapaLoaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
										}`}
								>
									Choose CSV File
								</label>
							</div>
							{internalFile && (
								<div className="mt-3 p-3 bg-green-50 rounded-lg">
									<div className="flex items-center space-x-2">
										<Check className="h-4 w-4 text-green-600" />
										<span className="text-sm font-medium text-green-800">{internalFile.name}</span>
									</div>
									<p className="text-xs text-green-600 mt-1">
										{internalFile.data.length} transactions loaded
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					<Card className="rounded-lg shadow-sm">
						<CardHeader>
							<CardTitle className="flex items-center space-x-2">
								<FileText className="h-5 w-5 text-green-600" />
								<span>Provider Statement</span>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
								<Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
								<p className="text-sm text-gray-600 mb-3">
									Upload payment processor statement
								</p>
								<input
									type="file"
									id="provider-upload"
									accept=".csv"
									onChange={(e) => handleFileUpload(e, 'provider')}
									className="hidden"
									disabled={!isPapaLoaded} // Disable if PapaParse not loaded
								/>
								<label
									htmlFor="provider-upload"
									className={`inline-flex items-center px-4 py-2 text-white rounded-lg cursor-pointer transition-colors ${isPapaLoaded ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
										}`}
								>
									Choose CSV File
								</label>
							</div>
							{providerFile && (
								<div className="mt-3 p-3 bg-green-50 rounded-lg">
									<div className="flex items-center space-x-2">
										<Check className="h-4 w-4 text-green-600" />
										<span className="text-sm font-medium text-green-800">{providerFile.name}</span>
									</div>
									<p className="text-xs text-green-600 mt-1">
										{providerFile.data.length} transactions loaded
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Reconcile Button */}
				<div className="text-center mb-8">
					<Button
						onClick={performReconciliation}
						disabled={!internalFile || !providerFile || isProcessing || !isPapaLoaded} // Disable if PapaParse not loaded
						className="px-8 py-3 text-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors rounded-lg"
					>
						{isProcessing ? (
							<>
								<RefreshCw className="h-5 w-5 mr-2 animate-spin" />
								Processing Reconciliation...
							</>
						) : (
							'Run Reconciliation'
						)}
					</Button>
				</div>

				{/* Results Section */}
				{reconciliationResult && (
					<div className="space-y-6">
						{/* Summary Cards */}
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							<Card className="border-green-200 bg-green-50 rounded-lg shadow-sm">
								<CardContent className="flex items-center space-x-3 py-4">
									<Check className="h-8 w-8 text-green-600" />
									<div>
										<p className="text-2xl font-bold text-green-800">
											{reconciliationResult.matched.length}
										</p>
										<p className="text-sm text-green-600">Matched</p>
									</div>
								</CardContent>
							</Card>

							<Card className="border-orange-200 bg-orange-50 rounded-lg shadow-sm">
								<CardContent className="flex items-center space-x-3 py-4">
									<AlertTriangle className="h-8 w-8 text-orange-600" />
									<div>
										<p className="text-2xl font-bold text-orange-800">
											{reconciliationResult.mismatched.length}
										</p>
										<p className="text-sm text-orange-600">Mismatched</p>
									</div>
								</CardContent>
							</Card>

							<Card className="border-yellow-200 bg-yellow-50 rounded-lg shadow-sm">
								<CardContent className="flex items-center space-x-3 py-4">
									<AlertTriangle className="h-8 w-8 text-yellow-600" />
									<div>
										<p className="text-2xl font-bold text-yellow-800">
											{reconciliationResult.internalOnly.length}
										</p>
										<p className="text-sm text-yellow-600">Internal Only</p>
									</div>
								</CardContent>
							</Card>

							<Card className="border-red-200 bg-red-50 rounded-lg shadow-sm">
								<CardContent className="flex items-center space-x-3 py-4">
									<X className="h-8 w-8 text-red-600" />
									<div>
										<p className="text-2xl font-bold text-red-800">
											{reconciliationResult.providerOnly.length}
										</p>
										<p className="text-sm text-red-600">Provider Only</p>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Detailed Results */}
						<div className="grid grid-cols-1 gap-6">
							{/* Matched Transactions */}
							<Card className="rounded-lg shadow-sm">
								<CardHeader className="bg-green-50 rounded-t-lg">
									<div className="flex justify-between items-center">
										<CardTitle className="flex items-center space-x-2 text-green-800">
											<Check className="h-5 w-5" />
											<span>Matched Transactions ({reconciliationResult.matched.length})</span>
										</CardTitle>
										{reconciliationResult.matched.length > 0 && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => exportToCsv(reconciliationResult.matched, 'matched-transactions.csv')}
												className="border-green-200 text-green-700 hover:bg-green-100 transition-colors rounded-lg"
											>
												<Download className="h-4 w-4 mr-2" />
												Export CSV
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent className="p-0">
									{reconciliationResult.matched.length > 0 ? (
										<>
											<div className="overflow-x-auto p-4">
												<table className="w-full text-sm">
													<thead>
														<tr className="border-b">
															<th className="text-left py-2">Reference</th>
															<th className="text-left py-2">Amount</th>
															<th className="text-left py-2">Status</th>
															<th className="text-left py-2">Date</th>
														</tr>
													</thead>
													<tbody>
														{getPaginatedData(reconciliationResult.matched, currentPage.matched, itemsPerPage).data.map((txn, index) => (
															<tr key={index} className="border-b last:border-b-0">
																<td className="py-2 font-mono text-xs">{txn.transaction_reference}</td>
																<td className="py-2">{formatCurrency(txn.amount)}</td>
																<td className="py-2">
																	<span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
																		{txn.status}
																	</span>
																</td>
																<td className="py-2">{txn.date}</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
											<PaginationControls
												currentPage={getPaginatedData(reconciliationResult.matched, currentPage.matched, itemsPerPage).currentPage}
												totalPages={getPaginatedData(reconciliationResult.matched, currentPage.matched, itemsPerPage).totalPages}
												onPageChange={(page) => setCurrentPage(prev => ({ ...prev, matched: page }))}
												totalItems={getPaginatedData(reconciliationResult.matched, currentPage.matched, itemsPerPage).totalItems}
												startIndex={getPaginatedData(reconciliationResult.matched, currentPage.matched, itemsPerPage).startIndex}
												endIndex={getPaginatedData(reconciliationResult.matched, currentPage.matched, itemsPerPage).endIndex}
											/>
										</>
									) : (
										<p className="text-gray-500 text-center py-4">No matched transactions found</p>
									)}
								</CardContent>
							</Card>

							{/* Mismatched Transactions */}
							{reconciliationResult.mismatched.length > 0 && (
								<Card className="rounded-lg shadow-sm">
									<CardHeader className="bg-orange-50 rounded-t-lg">
										<div className="flex justify-between items-center">
											<CardTitle className="flex items-center space-x-2 text-orange-800">
												<AlertTriangle className="h-5 w-5" />
												<span>Mismatched Transactions ({reconciliationResult.mismatched.length})</span>
											</CardTitle>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													const flatData = reconciliationResult.mismatched.map(m => ({
														...m.internal,
														provider_reference: m.provider.transaction_reference,
														provider_amount: m.provider.amount,
														provider_status: m.provider.status,
														provider_date: m.provider.date,
														differences: m.differences.join('; ')
													}));
													exportToCsv(flatData, 'mismatched-transactions.csv');
												}}
												className="border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors rounded-lg"
											>
												<Download className="h-4 w-4 mr-2" />
												Export CSV
											</Button>
										</div>
									</CardHeader>
									<CardContent className="p-0">
										<div className="space-y-4 p-4">
											{getPaginatedData(reconciliationResult.mismatched, currentPage.mismatched, 5).data.map((mismatch, index) => (
												<div key={index} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
													<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
														<div>
															<h4 className="font-medium text-sm mb-2 text-gray-800">Internal System</h4>
															<p className="text-xs font-mono text-gray-700">{mismatch.internal.transaction_reference}</p>
															<p className="text-sm text-gray-700">{formatCurrency(mismatch.internal.amount)} • {mismatch.internal.status}</p>
															<p className="text-xs text-gray-700">{mismatch.internal.date}</p>
														</div>
														<div>
															<h4 className="font-medium text-sm mb-2 text-gray-800">Provider</h4>
															<p className="text-xs font-mono text-gray-700">{mismatch.provider.transaction_reference}</p>
															<p className="text-sm text-gray-700">{formatCurrency(mismatch.provider.amount)} • {mismatch.provider.status}</p>
															<p className="text-xs text-gray-700">{mismatch.provider.date}</p>
														</div>
													</div>
													<div className="mt-3 pt-3 border-t border-orange-200">
														<p className="text-xs font-medium text-orange-800 mb-1">Differences:</p>
														<ul className="text-xs text-orange-700 list-disc pl-4">
															{mismatch.differences.map((diff, i) => (
																<li key={i}>{diff}</li>
															))}
														</ul>
													</div>
												</div>
											))}
										</div>
										<PaginationControls
											currentPage={getPaginatedData(reconciliationResult.mismatched, currentPage.mismatched, 5).currentPage}
											totalPages={getPaginatedData(reconciliationResult.mismatched, currentPage.mismatched, 5).totalPages}
											onPageChange={(page) => setCurrentPage(prev => ({ ...prev, mismatched: page }))}
											totalItems={getPaginatedData(reconciliationResult.mismatched, currentPage.mismatched, 5).totalItems}
											startIndex={getPaginatedData(reconciliationResult.mismatched, currentPage.mismatched, 5).startIndex}
											endIndex={getPaginatedData(reconciliationResult.mismatched, currentPage.mismatched, 5).endIndex}
										/>
									</CardContent>
								</Card>
							)}

							{/* Internal Only */}
							{reconciliationResult.internalOnly.length > 0 && (
								<Card className="rounded-lg shadow-sm">
									<CardHeader className="bg-yellow-50 rounded-t-lg">
										<div className="flex justify-between items-center">
											<CardTitle className="flex items-center space-x-2 text-yellow-800">
												<AlertTriangle className="h-5 w-5" />
												<span>Present Only in Internal ({reconciliationResult.internalOnly.length})</span>
											</CardTitle>
											<Button
												variant="outline"
												size="sm"
												onClick={() => exportToCsv(reconciliationResult.internalOnly, 'internal-only-transactions.csv')}
												className="border-yellow-200 text-yellow-700 hover:bg-yellow-100 transition-colors rounded-lg"
											>
												<Download className="h-4 w-4 mr-2" />
												Export CSV
											</Button>
										</div>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto p-4">
											<table className="w-full text-sm">
												<thead>
													<tr className="border-b">
														<th className="text-left py-2">Reference</th>
														<th className="text-left py-2">Amount</th>
														<th className="text-left py-2">Status</th>
														<th className="text-left py-2">Date</th>
													</tr>
												</thead>
												<tbody>
													{getPaginatedData(reconciliationResult.internalOnly, currentPage.internalOnly, itemsPerPage).data.map((txn, index) => (
														<tr key={index} className="border-b last:border-b-0">
															<td className="py-2 font-mono text-xs">{txn.transaction_reference}</td>
															<td className="py-2">{formatCurrency(txn.amount)}</td>
															<td className="py-2">
																<span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
																	{txn.status}
																</span>
															</td>
															<td className="py-2">{txn.date}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										<PaginationControls
											currentPage={getPaginatedData(reconciliationResult.internalOnly, currentPage.internalOnly, itemsPerPage).currentPage}
											totalPages={getPaginatedData(reconciliationResult.internalOnly, currentPage.internalOnly, itemsPerPage).totalPages}
											onPageChange={(page) => setCurrentPage(prev => ({ ...prev, internalOnly: page }))}
											totalItems={getPaginatedData(reconciliationResult.internalOnly, currentPage.internalOnly, itemsPerPage).totalItems}
											startIndex={getPaginatedData(reconciliationResult.internalOnly, currentPage.internalOnly, itemsPerPage).startIndex}
											endIndex={getPaginatedData(reconciliationResult.internalOnly, currentPage.internalOnly, itemsPerPage).endIndex}
										/>
									</CardContent>
								</Card>
							)}

							{/* Provider Only */}
							{reconciliationResult.providerOnly.length > 0 && (
								<Card className="rounded-lg shadow-sm">
									<CardHeader className="bg-red-50 rounded-t-lg">
										<div className="flex justify-between items-center">
											<CardTitle className="flex items-center space-x-2 text-red-800">
												<X className="h-5 w-5" />
												<span>Present Only in Provider ({reconciliationResult.providerOnly.length})</span>
											</CardTitle>
											<Button
												variant="outline"
												size="sm"
												onClick={() => exportToCsv(reconciliationResult.providerOnly, 'provider-only-transactions.csv')}
												className="border-red-200 text-red-700 hover:bg-red-100 transition-colors rounded-lg"
											>
												<Download className="h-4 w-4 mr-2" />
												Export CSV
											</Button>
										</div>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto p-4">
											<table className="w-full text-sm">
												<thead>
													<tr className="border-b">
														<th className="text-left py-2">Reference</th>
														<th className="text-left py-2">Amount</th>
														<th className="text-left py-2">Status</th>
														<th className="text-left py-2">Date</th>
													</tr>
												</thead>
												<tbody>
													{getPaginatedData(reconciliationResult.providerOnly, currentPage.providerOnly, itemsPerPage).data.map((txn, index) => (
														<tr key={index} className="border-b last:border-b-0">
															<td className="py-2 font-mono text-xs">{txn.transaction_reference}</td>
															<td className="py-2">{formatCurrency(txn.amount)}</td>
															<td className="py-2">
																<span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">
																	{txn.status}
																</span>
															</td>
															<td className="py-2">{txn.date}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										<PaginationControls
											currentPage={getPaginatedData(reconciliationResult.providerOnly, currentPage.providerOnly, itemsPerPage).currentPage}
											totalPages={getPaginatedData(reconciliationResult.providerOnly, currentPage.providerOnly, itemsPerPage).totalPages}
											onPageChange={(page) => setCurrentPage(prev => ({ ...prev, providerOnly: page }))}
											totalItems={getPaginatedData(reconciliationResult.providerOnly, currentPage.providerOnly, itemsPerPage).totalItems}
											startIndex={getPaginatedData(reconciliationResult.providerOnly, currentPage.providerOnly, itemsPerPage).startIndex}
											endIndex={getPaginatedData(reconciliationResult.providerOnly, currentPage.providerOnly, itemsPerPage).endIndex}
										/>
									</CardContent>
								</Card>
							)}
						</div>
					</div>
				)}

				{/* Instructions */}
				<Card className="mt-8 rounded-lg shadow-sm">
					<CardHeader>
						<CardTitle>How to Use</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div>
								<h4 className="font-medium mb-2 text-gray-800">Required CSV Format</h4>
								<p className="text-sm text-gray-600 mb-2">Both files must contain these columns:</p>
								<ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
									<li><code className="bg-gray-100 px-1 rounded font-mono">transaction_reference</code> (unique identifier)</li>
									<li><code className="bg-gray-100 px-1 rounded font-mono">amount</code> (numeric value)</li>
									<li><code className="bg-gray-100 px-1 rounded font-mono">status</code> (transaction status)</li>
									<li><code className="bg-gray-100 px-1 rounded font-mono">date</code> (transaction date)</li>
								</ul>
							</div>
							<div>
								<h4 className="font-medium mb-2 text-gray-800">Reconciliation Logic</h4>
								<ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
									<li>Transactions are matched by <code className="bg-gray-100 px-1 rounded font-mono">transaction_reference</code></li>
									<li>Amount differences {'>'} 0.01 are flagged as mismatched</li>
									<li>Status and Date differences are highlighted</li>
									<li>Export results for further analysis</li>
								</ul>
							</div>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
};

export default ReconciliationTool;