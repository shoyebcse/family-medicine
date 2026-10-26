package com.familymedicine.prescription;

import com.familymedicine.domain.RuleViolation;
import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class PrescriptionFiles {
    public record Page(String type, byte[] data) {}
    private final int maxBytes;
    private final int maxPages;
    public PrescriptionFiles(@Value("${prescriptions.max-bytes:10485760}") int maxBytes,
            @Value("${prescriptions.max-pages:8}") int maxPages) { this.maxBytes=maxBytes; this.maxPages=maxPages; }
    public int maxBytes() { return maxBytes; }
    public int maxPages() { return maxPages; }
    public List<Page> read(List<MultipartFile> files) {
        if(files==null || files.isEmpty() || files.size()>maxPages) throw invalid();
        long size=files.stream().mapToLong(MultipartFile::getSize).sum();
        if(size==0 || size>maxBytes) throw invalid();
        try {
            List<byte[]> data=new ArrayList<>();
            for(var file:files) data.add(file.getBytes());
            return render(data);
        } catch(IOException e) { throw invalid(); }
    }
    public List<Page> render(List<byte[]> data) {
        if(data==null || data.isEmpty() || data.size()>maxPages || data.stream().mapToLong(b->b.length).sum()>maxBytes) throw invalid();
        List<Page> pages=new ArrayList<>();
        try {
            for(var bytes:data) {
                if(bytes.length==0) throw invalid();
                boolean pdf=bytes.length>5 && new String(bytes,0,5,java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-");
                if(pdf) {
                    try(var document=Loader.loadPDF(bytes)) {
                        if(document.isEncrypted() || document.getNumberOfPages()<1 || document.getNumberOfPages()+pages.size()>maxPages) throw invalid();
                        var renderer=new PDFRenderer(document);
                        for(int i=0;i<document.getNumberOfPages();i++) {
                            var rect=document.getPage(i).getCropBox();
                            if(rect.getWidth()<=0 || rect.getHeight()<=0 || rect.getWidth()*rect.getHeight()>16000000) throw invalid();
                            float scale=Math.min(2f,2000f/Math.max(rect.getWidth(),rect.getHeight()));
                            var image=renderer.renderImage(i,scale);
                            var output=new ByteArrayOutputStream(); ImageIO.write(image,"png",output);
                            pages.add(new Page("image/png",output.toByteArray()));
                        }
                    }
                } else {
                    boolean png=bytes.length>8 && bytes[0]==(byte)137 && bytes[1]==80 && bytes[2]==78 && bytes[3]==71;
                    boolean jpg=bytes.length>3 && bytes[0]==(byte)255 && bytes[1]==(byte)216 && bytes[2]==(byte)255;
                    if(!png && !jpg) throw invalid();
                    try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                        var readers=ImageIO.getImageReaders(stream);
                        if(!readers.hasNext()) throw invalid();
                        var reader=readers.next();
                        try { reader.setInput(stream); if((long)reader.getWidth(0)*reader.getHeight(0)>24000000) throw invalid();
                            if(reader.read(0)==null) throw invalid();
                        } finally { reader.dispose(); }
                    }
                    pages.add(new Page(png?"image/png":"image/jpeg",bytes));
                }
                if(pages.size()>maxPages) throw invalid();
            }
        } catch(IOException | IllegalArgumentException e) { throw invalid(); }
        return pages;
    }
    private RuleViolation invalid() { return new RuleViolation("INVALID_PRESCRIPTION_FILE","Use readable JPG, PNG or non-password-protected PDF files, within the configured size and page limits.",422); }
}
