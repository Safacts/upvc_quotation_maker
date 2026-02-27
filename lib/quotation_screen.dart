import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'models.dart';
import 'pdf_generator.dart';

class QuotationScreen extends StatefulWidget {
  @override
  _QuotationScreenState createState() => _QuotationScreenState();
}

class _QuotationScreenState extends State<QuotationScreen> {
  final QuotationData data = QuotationData();
  final Color primaryColor = Color(0xFF1E3A5F);

  Widget _buildSectionTitle(String title) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(color: primaryColor, borderRadius: BorderRadius.circular(5)),
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      margin: EdgeInsets.only(top: 25, bottom: 15),
      child: Text(title, style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
    );
  }

  InputDecoration _inputStyle(String label) {
    return InputDecoration(
      labelText: label,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      isDense: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Color(0xFFE9EEF3),
      appBar: AppBar(
        title: Text('Venkateshwara UPVC', style: TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: primaryColor,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Bar Card
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Quote No', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        Text(data.quotationNo, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Date', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        Text(DateFormat('dd-MMM-yyyy').format(data.date), style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            
            _buildSectionTitle('Customer Details'),
            Card(
              elevation: 2,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  children: [
                    TextField(decoration: _inputStyle('Name'), onChanged: (val) => data.customerName = val),
                    SizedBox(height: 12),
                    TextField(decoration: _inputStyle('Reference'), onChanged: (val) => data.reference = val),
                    SizedBox(height: 12),
                    TextField(decoration: _inputStyle('Address'), onChanged: (val) => data.address = val),
                    SizedBox(height: 12),
                    TextField(decoration: _inputStyle('Contact No'), keyboardType: TextInputType.phone, onChanged: (val) => data.contactNo = val),
                  ],
                ),
              ),
            ),

            _buildSectionTitle('Measured Items'),
            ...data.measuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              MeasuredItem item = entry.value;
              return Card(
                elevation: 3,
                margin: EdgeInsets.only(bottom: 15),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Colors.grey.shade300)),
                child: Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Item #${index + 1}', style: TextStyle(fontWeight: FontWeight.bold, color: primaryColor)),
                          IconButton(
                            icon: Icon(Icons.delete_outline, color: Colors.red),
                            constraints: BoxConstraints(),
                            padding: EdgeInsets.zero,
                            onPressed: () => setState(() => data.measuredItems.removeAt(index))
                          ),
                        ],
                      ),
                      SizedBox(height: 10),
                      Row(children: [
                        Expanded(child: TextField(decoration: _inputStyle('Code'), onChanged: (val) => item.code = val)),
                        SizedBox(width: 10),
                        Expanded(flex: 2, child: TextField(decoration: _inputStyle('Description'), onChanged: (val) => item.description = val)),
                      ]),
                      SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextField(decoration: _inputStyle('W (MM)'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => item.width = double.tryParse(val) ?? 0))),
                        SizedBox(width: 10),
                        Expanded(child: TextField(decoration: _inputStyle('H (MM)'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => item.height = double.tryParse(val) ?? 0))),
                        SizedBox(width: 10),
                        Expanded(child: TextField(decoration: _inputStyle('Units'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => item.units = int.tryParse(val) ?? 1))),
                      ]),
                      SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextField(decoration: _inputStyle('Glass'), onChanged: (val) => item.glass = val)),
                        SizedBox(width: 10),
                        Expanded(child: TextField(decoration: _inputStyle('Rate (Rs)'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => item.rate = double.tryParse(val) ?? 0))),
                      ]),
                    ],
                  ),
                ),
              );
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: Icon(Icons.add), label: Text('Add Measured Item'),
                style: OutlinedButton.styleFrom(foregroundColor: primaryColor, side: BorderSide(color: primaryColor)),
                onPressed: () => setState(() => data.measuredItems.add(MeasuredItem())),
              ),
            ),

            _buildSectionTitle('Unmeasured Items'),
            ...data.unmeasuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              UnmeasuredItem item = entry.value;
              return Card(
                elevation: 2,
                margin: EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Unmeasured #${index + 1}', style: TextStyle(fontWeight: FontWeight.bold, color: primaryColor)),
                          IconButton(
                            icon: Icon(Icons.delete_outline, color: Colors.red),
                            constraints: BoxConstraints(), padding: EdgeInsets.zero,
                            onPressed: () => setState(() => data.unmeasuredItems.removeAt(index))
                          ),
                        ],
                      ),
                      SizedBox(height: 10),
                      TextField(decoration: _inputStyle('Description'), onChanged: (val) => item.description = val),
                      SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextField(decoration: _inputStyle('Units'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => item.units = int.tryParse(val) ?? 1))),
                        SizedBox(width: 10),
                        Expanded(child: TextField(decoration: _inputStyle('Rate (Rs)'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => item.rate = double.tryParse(val) ?? 0))),
                      ]),
                    ],
                  ),
                ),
              );
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: Icon(Icons.add), label: Text('Add Unmeasured Item'),
                style: OutlinedButton.styleFrom(foregroundColor: primaryColor, side: BorderSide(color: primaryColor)),
                onPressed: () => setState(() => data.unmeasuredItems.add(UnmeasuredItem())),
              ),
            ),
            
            _buildSectionTitle('Final Computations'),
            Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: TextField(decoration: _inputStyle('Transport Cost (Rs)'), keyboardType: TextInputType.number, onChanged: (val) => setState(() => data.transport = double.tryParse(val) ?? 0)),
              ),
            ),
            
            SizedBox(height: 30),
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton.icon(
                icon: Icon(Icons.picture_as_pdf),
                label: Text('GENERATE PDF', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(backgroundColor: primaryColor, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                onPressed: () => generateAndPreviewPdf(data, context),
              ),
            ),
            SizedBox(height: 30),
          ],
        ),
      ),
    );
  }
}
